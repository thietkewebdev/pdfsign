using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using PDFSignProSigner.Models;
using PDFSignProSigner.Services;

namespace PDFSignProSigner;

public partial class MainWindow : Window
{
    private readonly ApiService _api = new();
    private readonly CoreService _core = new();
    private JobInfo? _job;
    private string _signedPublicUrl = "";
    private string _dllPath = "";
    private ObservableCollection<CertInfo> _certs = new();
    private DispatcherTimer? _pinDebounceTimer;
    private CancellationTokenSource? _loadCertsCts;

    public MainWindow()
    {
        InitializeComponent();
        CertCombo.ItemsSource = _certs;
    }

    public void ProcessDeepLink(string url)
    {
        LogService.Info($"ProcessDeepLink: {url?.Length ?? 0} chars");
        BringWindowToFront();

        var payload = DeepLinkService.Parse(url ?? "");
        if (payload == null)
        {
            MessageBox.Show("Liên kết không hợp lệ.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        _ = RunFlowAsync(payload);
    }

    private async Task RunFlowAsync(DeepLinkPayload payload)
    {
        ShowScreen(Screen.Loading);
        LoadingText.Text = "Đang xác thực...";

        try
        {
            var apiBase = ApiHelpers.BuildApiBaseUrl(payload.Host);
            LoadingText.Text = "Đang xác thực mã claim...";
            var (jobToken, resolvedApiBase) = await _api.ClaimAsync(apiBase, payload.JobId, payload.ClaimCode);

            LoadingText.Text = "Đang tải thông tin job...";
            _job = await _api.GetJobAsync(resolvedApiBase, payload.JobId, jobToken);

            LoadingText.Text = "Đang tải PDF...";
            var pdfBytes = await _api.DownloadPdfAsync(_job.InputPdfUrl);
            var tempDir = Path.Combine(Path.GetTempPath(), "PDFSignProSigner", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            var inputPath = Path.Combine(tempDir, "input.pdf");
            await File.WriteAllBytesAsync(inputPath, pdfBytes);

            _job = _job with { }; // keep job, we'll store inputPath in a field
            _inputPdfPath = inputPath;
            _tempDir = tempDir;

            SubtitleText.Text = _job.DocumentTitle;
            DocTitleText.Text = _job.DocumentTitle;
            ShowScreen(Screen.Sign);
            ResetSignState();
        }
        catch (HttpRequestException ex)
        {
            ShowError($"Lỗi mạng: {ex.Message}");
        }
        catch (Exception ex)
        {
            LogService.Error("RunFlowAsync failed", ex);
            ShowError(GetFriendlyMessage(ex));
        }
    }

    private string _inputPdfPath = "";
    private string _tempDir = "";

    private void ShowScreen(Screen screen)
    {
        IdlePanel.Visibility = screen == Screen.Idle ? Visibility.Visible : Visibility.Collapsed;
        LoadingPanel.Visibility = screen == Screen.Loading ? Visibility.Visible : Visibility.Collapsed;
        SignPanel.Visibility = screen == Screen.Sign ? Visibility.Visible : Visibility.Collapsed;
        SigningPanel.Visibility = screen == Screen.Signing ? Visibility.Visible : Visibility.Collapsed;
        SuccessPanel.Visibility = screen == Screen.Success ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ResetSignState()
    {
        _certs.Clear();
        _dllPath = "";
        SignErrorText.Text = "";
        SignErrorText.Visibility = Visibility.Collapsed;
        CertLoadingPanel.Visibility = Visibility.Collapsed;
        CertCombo.IsEnabled = false;
        SignBtn.IsEnabled = false;
        PinBox.Password = "";
        _pinDebounceTimer?.Stop();
        _loadCertsCts?.Cancel();
    }

    private void ShowError(string msg)
    {
        ShowScreen(Screen.Sign);
        SignErrorText.Text = msg;
        SignErrorText.Visibility = Visibility.Visible;
        PinBox.Focus();
    }

    private static string GetFriendlyMessage(Exception ex)
    {
        if (ex.Message.Contains("404")) return "Job không tồn tại hoặc đã hết hạn.";
        if (ex.Message.Contains("401")) return "Mã claim không đúng.";
        if (ex.Message.Contains("410")) return "Job đã hết hạn.";
        return ex.Message;
    }

    private void PinBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        SignErrorText.Visibility = Visibility.Collapsed;
        _pinDebounceTimer?.Stop();
        _loadCertsCts?.Cancel();
        var pin = PinBox.Password;
        if (string.IsNullOrEmpty(pin))
        {
            CertCombo.IsEnabled = false;
            SignBtn.IsEnabled = false;
            _certs.Clear();
            CertLoadingPanel.Visibility = Visibility.Collapsed;
            return;
        }
        _pinDebounceTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _pinDebounceTimer.Tick += (_, _) =>
        {
            _pinDebounceTimer?.Stop();
            _ = LoadCertsAsync();
        };
        _pinDebounceTimer.Start();
    }

    private async Task LoadCertsAsync()
    {
        var pin = PinBox.Password;
        if (string.IsNullOrEmpty(pin)) return;

        _loadCertsCts?.Cancel();
        _loadCertsCts = new CancellationTokenSource();
        var ct = _loadCertsCts.Token;

        CertLoadingPanel.Visibility = Visibility.Visible;
        CertCombo.IsEnabled = false;
        SignBtn.IsEnabled = false;
        SignErrorText.Visibility = Visibility.Collapsed;
        _certs.Clear();

        try
        {
            var (dllPath, certs, stdout, stderr) = await _core.ListCertsAsync(null, pin);
            if (ct.IsCancellationRequested) return;

            _dllPath = dllPath;
            var validCerts = certs.Where(c => c.IsValid).ToList();

            foreach (var c in validCerts) _certs.Add(c);

            if (validCerts.Count > 0)
            {
                CertCombo.SelectedIndex = 0;
                CertCombo.IsEnabled = true;
                SignBtn.IsEnabled = true;
            }
            else if (certs.Count > 0)
            {
                SignErrorText.Text = "Không có chứng chỉ còn hiệu lực.";
                SignErrorText.Visibility = Visibility.Visible;
            }
            else if (!string.IsNullOrEmpty(stderr))
            {
                var msg = stderr.Trim();
                if (msg.Contains("CKR_PIN_INCORRECT", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("incorrect", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("sai", StringComparison.OrdinalIgnoreCase))
                    SignErrorText.Text = "Mã PIN không đúng. Vui lòng thử lại.";
                else if (msg.Contains("No PKCS#11") || msg.Contains("not found") || msg.Contains("DLL"))
                    SignErrorText.Text = "Không tìm thấy token/USB. Cắm token và thử lại.";
                else
                    SignErrorText.Text = msg;
                SignErrorText.Visibility = Visibility.Visible;
                PinBox.Focus();
            }
        }
        catch (FileNotFoundException)
        {
            if (ct.IsCancellationRequested) return;
            SignErrorText.Text = "Không tìm thấy PDFSignProSignerCore.exe. Vui lòng cài đặt đầy đủ.";
            SignErrorText.Visibility = Visibility.Visible;
            PinBox.Focus();
        }
        catch (OperationCanceledException) { /* ignore */ }
        catch (Exception ex)
        {
            if (ct.IsCancellationRequested) return;
            SignErrorText.Text = ex.Message;
            SignErrorText.Visibility = Visibility.Visible;
            PinBox.Focus();
        }
        finally
        {
            if (!ct.IsCancellationRequested)
            {
                CertLoadingPanel.Visibility = Visibility.Collapsed;
            }
        }
    }

    private async void Sign_Click(object sender, RoutedEventArgs e)
    {
        if (_job == null) return;

        var pin = PinBox.Password;
        if (string.IsNullOrEmpty(pin))
        {
            MessageBox.Show("Vui lòng nhập mã PIN.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (CertCombo.SelectedItem is not CertInfo cert)
        {
            MessageBox.Show("Vui lòng nhập mã PIN và chờ danh sách chứng chỉ hiển thị.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (string.IsNullOrEmpty(_dllPath))
        {
            MessageBox.Show("Vui lòng nhấn \"Làm mới chứng chỉ\" trước khi ký.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!_core.CoreExists)
        {
            MessageBox.Show("Không tìm thấy PDFSignProSignerCore.exe.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var (rectValid, rectError) = _job.Placement.Rect.Validate();
        if (!rectValid)
        {
            SignErrorText.Text = rectError ?? "Vị trí chữ ký không hợp lệ.";
            SignErrorText.Visibility = Visibility.Visible;
            return;
        }

        SignBtn.IsEnabled = false;
        CertCombo.IsEnabled = false;
        PinBox.IsEnabled = false;
        ShowScreen(Screen.Signing);
        SigningText.Text = "Đang ký PDF...";
        SigningLog.Text = "";

        var outputPath = Path.Combine(_tempDir, "signed.pdf");
        var logLines = new List<string>();

        try
        {
            var result = await _core.SignAsync(
                _inputPdfPath,
                outputPath,
                _dllPath,
                cert.Index,
                pin,
                _job.Placement.Page,
                _job.Placement.Rect
            );

            logLines.Add(result.Stdout);
            if (!string.IsNullOrEmpty(result.Stderr)) logLines.Add(result.Stderr);
            SigningLog.Text = string.Join("\n", logLines);

            if (!result.Success)
            {
                ShowScreen(Screen.Sign);
                SignErrorText.Text = result.Stderr ?? result.Stdout ?? $"Lỗi (exit {result.ExitCode})";
                SignErrorText.Visibility = Visibility.Visible;
                SignBtn.IsEnabled = _certs.Count > 0;
                CertCombo.IsEnabled = _certs.Count > 0;
                PinBox.IsEnabled = true;
                return;
            }

            SigningText.Text = "Đang tải lên server...";
            var signingTime = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
            _signedPublicUrl = await _api.CompleteAsync(
                _job,
                outputPath,
                cert.SubjectO ?? "",
                cert.SubjectCN ?? "",
                cert.Serial,
                signingTime
            );

            ShowScreen(Screen.Success);
        }
        catch (Exception ex)
        {
            logLines.Add(ex.Message);
            SigningLog.Text = string.Join("\n", logLines);
            ShowScreen(Screen.Sign);
            SignErrorText.Text = ex.Message;
            SignErrorText.Visibility = Visibility.Visible;
        }
        finally
        {
            SignBtn.IsEnabled = _certs.Count > 0;
            CertCombo.IsEnabled = _certs.Count > 0;
            PinBox.IsEnabled = true;
        }
    }

    private void OpenDoc_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_signedPublicUrl)) return;
        try
        {
            Process.Start(new ProcessStartInfo(_signedPublicUrl) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Không thể mở: {ex.Message}", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private enum Screen { Idle, Loading, Sign, Signing, Success }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr _);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private const int SW_RESTORE = 9;
    private const uint FLASHW_ALL = 3;
    private const uint FLASHW_TIMERNOFG = 12;

    private void BringWindowToFront()
    {
        if (WindowState == WindowState.Minimized)
            WindowState = WindowState.Normal;
        Show();
        Activate();
        Focus();

        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == IntPtr.Zero) return;

        ShowWindow(hwnd, SW_RESTORE);

        var fg = GetForegroundWindow();
        var fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
        var ourThread = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
        if (fgThread != ourThread && AttachThreadInput(ourThread, fgThread, true))
        {
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
            AttachThreadInput(ourThread, fgThread, false);
        }
        else
        {
            SetForegroundWindow(hwnd);
        }

        if (GetForegroundWindow() != hwnd)
        {
            var fi = new FLASHWINFO
            {
                cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO)),
                hwnd = hwnd,
                dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG,
                uCount = 6,
                dwTimeout = 0
            };
            FlashWindowEx(ref fi);
        }

        Dispatcher.BeginInvoke(() =>
        {
            Activate();
            Focus();
            var h = new WindowInteropHelper(this).Handle;
            if (h != IntPtr.Zero)
            {
                SetForegroundWindow(h);
                if (GetForegroundWindow() != h)
                {
                    var fi2 = new FLASHWINFO
                    {
                        cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO)),
                        hwnd = h,
                        dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG,
                        uCount = 6,
                        dwTimeout = 0
                    };
                    FlashWindowEx(ref fi2);
                }
            }
        }, DispatcherPriority.ApplicationIdle);
    }
}
