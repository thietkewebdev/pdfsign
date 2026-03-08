using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using Microsoft.Win32;
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
    private string? _signedDownloadUrl;
    private string _dllPath = "";
    private ObservableCollection<CertInfo> _certs = new();
    private bool _pinVerified;
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
        _pinVerified = false;
        _signedDownloadUrl = null;
        SignErrorText.Text = "";
        SignErrorText.Visibility = Visibility.Collapsed;
        VerifyPinResultText.Text = "";
        VerifyPinResultText.Visibility = Visibility.Collapsed;
        CertLoadingPanel.Visibility = Visibility.Collapsed;
        CertCombo.IsEnabled = false;
        SignBtn.IsEnabled = false;
        PinBox.Password = "";
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
        VerifyPinResultText.Visibility = Visibility.Collapsed;
        _loadCertsCts?.Cancel();
        _pinVerified = false;
        _certs.Clear();
        _dllPath = "";
        CertCombo.IsEnabled = false;
        SignBtn.IsEnabled = false;
        CertLoadingPanel.Visibility = Visibility.Collapsed;
    }

    private async void VerifyPin_Click(object sender, RoutedEventArgs e)
    {
        var pin = PinBox.Password;
        if (string.IsNullOrEmpty(pin))
        {
            VerifyPinResultText.Text = "Vui lòng nhập mã PIN.";
            VerifyPinResultText.Foreground = (System.Windows.Media.Brush)this.FindResource("TextSecondaryBrush");
            VerifyPinResultText.Visibility = Visibility.Visible;
            return;
        }
        await VerifyAndLoadCertsAsync();
    }

    private async Task VerifyAndLoadCertsAsync()
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
        VerifyPinResultText.Visibility = Visibility.Collapsed;
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
                _pinVerified = true;
                CertCombo.SelectedIndex = 0;
                CertCombo.IsEnabled = true;
                SignBtn.IsEnabled = true;
                VerifyPinResultText.Text = "✓ PIN đúng. Đã tải chứng thư số.";
                VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#22C55E"));
                VerifyPinResultText.Visibility = Visibility.Visible;
            }
            else if (certs.Count > 0)
            {
                VerifyPinResultText.Text = "Không có chứng chỉ còn hiệu lực.";
                VerifyPinResultText.Foreground = (System.Windows.Media.Brush)this.FindResource("TextSecondaryBrush");
                VerifyPinResultText.Visibility = Visibility.Visible;
            }
            else if (!string.IsNullOrEmpty(stderr))
            {
                var msg = stderr.Trim();
                if (msg.Contains("CKR_PIN_INCORRECT", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("incorrect", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("sai", StringComparison.OrdinalIgnoreCase))
                    msg = "Mã PIN không đúng. Sai nhiều lần có thể khóa token.";
                else if (msg.Contains("No PKCS#11") || msg.Contains("not found") || msg.Contains("DLL"))
                    msg = "Không tìm thấy token/USB. Cắm token và thử lại.";
                VerifyPinResultText.Text = msg;
                VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#F87171"));
                VerifyPinResultText.Visibility = Visibility.Visible;
                PinBox.Focus();
            }
        }
        catch (FileNotFoundException)
        {
            if (ct.IsCancellationRequested) return;
            VerifyPinResultText.Text = "Không tìm thấy PDFSignProSignerCore.exe. Vui lòng cài đặt đầy đủ.";
            VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#F87171"));
            VerifyPinResultText.Visibility = Visibility.Visible;
            PinBox.Focus();
        }
        catch (OperationCanceledException) { /* ignore */ }
        catch (Exception ex)
        {
            if (ct.IsCancellationRequested) return;
            VerifyPinResultText.Text = ex.Message;
            VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#F87171"));
            VerifyPinResultText.Visibility = Visibility.Visible;
            PinBox.Focus();
        }
        finally
        {
            if (!ct.IsCancellationRequested)
                CertLoadingPanel.Visibility = Visibility.Collapsed;
        }
    }

    private async void Sign_Click(object sender, RoutedEventArgs e)
    {
        if (_job == null) return;

        var pin = PinBox.Password;
        if (!_pinVerified)
        {
            MessageBox.Show("Vui lòng nhấn \"Kiểm tra PIN\" trước khi ký.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

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
            MessageBox.Show("Vui lòng nhấn \"Kiểm tra PIN\" trước khi ký.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
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
            (_signedPublicUrl, _signedDownloadUrl) = await _api.CompleteAsync(
                _job,
                outputPath,
                cert.SubjectO ?? "",
                cert.SubjectCN ?? "",
                cert.IssuerCN,
                cert.Serial,
                signingTime
            );

            ShowScreen(Screen.Success);
            UpdateSuccessButtons();
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

    private void UpdateSuccessButtons()
    {
        var hasDownload = !string.IsNullOrEmpty(_signedDownloadUrl);
        DownloadPdfBtn.IsEnabled = hasDownload;
        SuccessErrorText.Visibility = !hasDownload ? Visibility.Visible : Visibility.Collapsed;
        if (!hasDownload)
            SuccessErrorText.Text = "Không nhận được liên kết tải từ server. Bạn có thể tải PDF trực tiếp từ trang web.";
    }

    private static string SanitizeFileName(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "document-signed.pdf";
        var baseName = Path.GetFileNameWithoutExtension(title.Trim());
        if (string.IsNullOrEmpty(baseName)) return "document-signed.pdf";
        foreach (var c in Path.GetInvalidFileNameChars())
            baseName = baseName.Replace(c, '_');
        return baseName.Trim() + "-signed.pdf";
    }

    private async void DownloadPdf_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_signedDownloadUrl)) return;

        var defaultName = _job != null ? SanitizeFileName(_job.DocumentTitle) : "signed.pdf";
        var dlg = new SaveFileDialog
        {
            Filter = "PDF files (*.pdf)|*.pdf|All files (*.*)|*.*",
            DefaultExt = "pdf",
            FileName = defaultName,
        };
        if (dlg.ShowDialog() != true) return;

        DownloadPdfBtn.IsEnabled = false;
        DownloadPdfBtn.Content = "Đang tải...";

        try
        {
            await _api.DownloadToFileAsync(_signedDownloadUrl, dlg.FileName);
            DownloadPdfBtn.Content = "Tải PDF đã ký";
            DownloadPdfBtn.IsEnabled = true;

            var result = MessageBox.Show(
                $"Đã lưu PDF thành công.\n\n{dlg.FileName}\n\nBạn có muốn mở thư mục chứa file?",
                "PDFSignPro Signer",
                MessageBoxButton.YesNo,
                MessageBoxImage.Information);
            if (result == MessageBoxResult.Yes)
            {
                var dir = Path.GetDirectoryName(dlg.FileName);
                if (!string.IsNullOrEmpty(dir))
                    Process.Start("explorer.exe", $"/select,\"{dlg.FileName}\"");
            }
        }
        catch (HttpRequestException ex)
        {
            DownloadPdfBtn.Content = "Tải PDF đã ký";
            DownloadPdfBtn.IsEnabled = true;
            var isExpired = ex.Message.Contains("403", StringComparison.OrdinalIgnoreCase) ||
                            ex.Message.Contains("Forbidden", StringComparison.OrdinalIgnoreCase);
            var msg = isExpired
                ? "Liên kết tải đã hết hạn.\n\n"
                : "Không thể tải file (lỗi mạng).\n\n";
            if (!string.IsNullOrEmpty(_signedPublicUrl))
                msg += "Vui lòng mở trang web và tải PDF trực tiếp:\n" + _signedPublicUrl;
            else
                msg += "Vui lòng thử lại sau.";
            MessageBox.Show(msg, "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
            LogService.Error("Download failed", ex);
        }
        catch (Exception ex)
        {
            DownloadPdfBtn.Content = "Tải PDF đã ký";
            DownloadPdfBtn.IsEnabled = true;
            var msg = ex.Message.Contains("403", StringComparison.OrdinalIgnoreCase) ||
                      ex.Message.Contains("expired", StringComparison.OrdinalIgnoreCase) ||
                      ex.Message.Contains("hết hạn", StringComparison.OrdinalIgnoreCase)
                ? "Liên kết tải đã hết hạn.\n\nVui lòng mở trang web và tải PDF trực tiếp từ đó."
                : $"Lỗi: {ex.Message}";
            if (!string.IsNullOrEmpty(_signedPublicUrl))
                msg += "\n\nTrang web: " + _signedPublicUrl;
            MessageBox.Show(msg, "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
            LogService.Error("Download failed", ex);
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
