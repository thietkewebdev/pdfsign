using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using PDFSignProSigner.Models;
using PDFSignProSigner.Services;

namespace PDFSignProSigner;

public partial class MainWindow : Window
{
    private readonly ApiService _api = new();
    private readonly CoreService _core = new();
    private readonly AppSettings _appSettings;
    private readonly SignatureTemplateManager _templateManager;
    private JobInfo? _job;
    private string _signedPublicUrl = "";
    private string? _signedDownloadUrl;
    private string _dllPath = "";
    private ObservableCollection<CertInfo> _certs = new();
    private bool _pinVerified;
    private CancellationTokenSource? _loadCertsCts;
    /// <summary>PIN đã lưu cho token hiện tại. Xóa khi đổi USB.</summary>
    private string? _cachedPin;
    /// <summary>Định danh token (dllPath + cert serials). Dùng để phát hiện đổi USB.</summary>
    private string? _cachedTokenId;
    private bool _signFlowBusy;
    private bool _suppressPreferCertEvent;

    public MainWindow()
    {
        _appSettings = AppSettings.Load();
        _templateManager = new SignatureTemplateManager(_appSettings);
        InitializeComponent();
        CertCombo.ItemsSource = _certs;
        TemplateList.ItemsSource = _templateManager.Templates;
        SelectTemplateFromManager();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        IdleCheckUpdates.IsChecked = _appSettings.CheckUpdatesOnStartup;
        IdleRemindUsb.IsChecked = _appSettings.RemindUnplugTokenAfterSign;
        try
        {
            await Task.Delay(2000);
            await SignerUpdateChecker.CheckAndOfferUpdateAsync(this, _appSettings, silentIfUpToDate: true);
        }
        catch
        {
            /* ignore */
        }
    }

    private void IdleSettings_Changed(object sender, RoutedEventArgs e)
    {
        _appSettings.CheckUpdatesOnStartup = IdleCheckUpdates.IsChecked == true;
        _appSettings.RemindUnplugTokenAfterSign = IdleRemindUsb.IsChecked == true;
        _appSettings.Save();
    }

    private async void CheckUpdatesNow_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await SignerUpdateChecker.CheckAndOfferUpdateAsync(this, _appSettings, silentIfUpToDate: false);
        }
        catch (Exception ex)
        {
            LogService.Error("Manual update check failed", ex);
            System.Windows.MessageBox.Show(
                $"Lỗi: {ex.Message}",
                "PDFSignPro Signer",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void OpenLogFolder_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var dir = LogService.GetLogDirectoryPath();
            Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = dir,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            LogService.Error("Open log folder failed", ex);
            System.Windows.MessageBox.Show(
                $"Không mở được thư mục nhật ký.\n{ex.Message}",
                "PDFSignPro Signer",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void ClearPreferredCert_Click(object sender, RoutedEventArgs e)
    {
        _appSettings.PreferredCertSerial = null;
        _appSettings.Save();
        _suppressPreferCertEvent = true;
        try
        {
            PreferThisCertCheckBox.IsChecked = false;
        }
        finally
        {
            _suppressPreferCertEvent = false;
        }

        System.Windows.MessageBox.Show(
            "Đã xóa chứng chỉ ưu tiên. Lần sau vào nhiều cert, hãy chọn lại và tick \"Luôn chọn chứng chỉ này\" nếu cần.",
            "PDFSignPro Signer",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    private void SelectTemplateFromManager()
    {
        var selected = _templateManager.SelectedTemplate;
        if (selected == null) return;
        for (var i = 0; i < TemplateList.Items.Count; i++)
        {
            if (TemplateList.Items[i] is SignatureTemplate t && t.Id == selected.Id)
            {
                TemplateList.SelectedIndex = i;
                break;
            }
        }
    }

    private void TemplateList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (TemplateList.SelectedItem is SignatureTemplate template)
            _templateManager.SelectTemplate(template);
    }

    public void ProcessDeepLink(string url)
    {
        LogService.Info($"ProcessDeepLink: {url?.Length ?? 0} chars");
        LogService.Signing("DeepLink: mở phiên ký từ liên kết");
        BringWindowToFront();

        var payload = DeepLinkService.Parse(url ?? "");
        if (payload == null)
        {
            System.Windows.MessageBox.Show("Liên kết không hợp lệ.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
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

            _sealImagePath = null;
            if (!string.IsNullOrEmpty(_job.SealImageUrl))
            {
                LoadingText.Text = "Đang tải ảnh con dấu...";
                var ext = _job.SealImageUrl.Contains(".png", StringComparison.OrdinalIgnoreCase) ? ".png" : ".jpg";
                var sealPath = Path.Combine(tempDir, $"seal{ext}");
                await _api.DownloadToFileAsync(_job.SealImageUrl, sealPath);
                _sealImagePath = sealPath;
            }

            _job = _job with { };
            _inputPdfPath = inputPath;
            _tempDir = tempDir;

            SubtitleText.Text = _job.DocumentTitle;
            DocTitleText.Text = _job.DocumentTitle;
            Title = TruncateWindowTitle($"PDFSignPro — {_job.DocumentTitle}");
            LogService.Signing($"Job sẵn sàng: id={payload.JobId} title={_job.DocumentTitle}");
            ShowScreen(Screen.Sign);
            ResetSignState();
            await TryAutoVerifyWithCachedPinAsync();
            if (!string.IsNullOrEmpty(payload.TemplateId))
                _templateManager.SelectTemplateById(payload.TemplateId);
            SelectTemplateFromManager();
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
    private string? _sealImagePath;

    private void ShowScreen(Screen screen)
    {
        IdlePanel.Visibility = screen == Screen.Idle ? Visibility.Visible : Visibility.Collapsed;
        LoadingPanel.Visibility = screen == Screen.Loading ? Visibility.Visible : Visibility.Collapsed;
        SignPanel.Visibility = screen == Screen.Sign ? Visibility.Visible : Visibility.Collapsed;
        SigningPanel.Visibility = screen == Screen.Signing ? Visibility.Visible : Visibility.Collapsed;
        SuccessPanel.Visibility = screen == Screen.Success ? Visibility.Visible : Visibility.Collapsed;

        if (screen == Screen.Sign || screen == Screen.Signing || screen == Screen.Success)
            ApplySigningChrome(_job != null);
        else if (screen == Screen.Idle)
        {
            ApplySigningChrome(false);
            Title = "PDFSignPro Signer";
        }
    }

    private static string TruncateWindowTitle(string s, int max = 72)
    {
        if (string.IsNullOrWhiteSpace(s)) return "PDFSignPro Signer";
        return s.Length <= max ? s : s[..(max - 1)] + "…";
    }

    /// <summary>Giao diện nhỏ gọn khi ký từ liên kết web (chủ yếu PIN + Ký số).</summary>
    private void ApplySigningChrome(bool compact)
    {
        if (compact)
        {
            Width = 380;
            Height = 420;
            MinWidth = 320;
            MinHeight = 320;
            HeaderPanel.Margin = new Thickness(0, 0, 0, 12);
            MainTitleText.FontSize = 18;
            DocTitleText.Visibility = Visibility.Collapsed;
            MainContentBorder.Padding = new Thickness(18);
        }
        else
        {
            Width = 480;
            Height = 620;
            MinWidth = 400;
            MinHeight = 420;
            HeaderPanel.Margin = new Thickness(0, 0, 0, 24);
            MainTitleText.FontSize = 22;
            DocTitleText.Visibility = Visibility.Visible;
            MainContentBorder.Padding = new Thickness(24);
        }
    }

    private void UpdateCertRowVisibility()
    {
        var show = _pinVerified && _certs.Count > 1;
        CertLabel.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        CertCombo.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        PreferThisCertCheckBox.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ApplyPreferredCertSelection()
    {
        if (_certs.Count == 0) return;
        var pref = _appSettings.PreferredCertSerial;
        if (string.IsNullOrEmpty(pref))
        {
            CertCombo.SelectedIndex = 0;
            return;
        }

        for (var i = 0; i < _certs.Count; i++)
        {
            if (string.Equals(_certs[i].Serial, pref, StringComparison.OrdinalIgnoreCase))
            {
                CertCombo.SelectedIndex = i;
                return;
            }
        }

        CertCombo.SelectedIndex = 0;
    }

    private void CertCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_certs.Count <= 1 || _suppressPreferCertEvent) return;
        _suppressPreferCertEvent = true;
        try
        {
            if (CertCombo.SelectedItem is CertInfo c)
            {
                PreferThisCertCheckBox.IsChecked = string.Equals(
                    c.Serial,
                    _appSettings.PreferredCertSerial,
                    StringComparison.OrdinalIgnoreCase);
            }
        }
        finally
        {
            _suppressPreferCertEvent = false;
        }
    }

    private void PreferThisCertCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressPreferCertEvent) return;
        if (PreferThisCertCheckBox.IsChecked == true && CertCombo.SelectedItem is CertInfo c)
        {
            _appSettings.PreferredCertSerial = c.Serial;
            _appSettings.Save();
            LogService.Signing($"Đặt chứng chỉ ưu tiên serial={c.Serial}");
        }
        else if (PreferThisCertCheckBox.IsChecked == false)
        {
            _appSettings.PreferredCertSerial = null;
            _appSettings.Save();
        }
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
        SignBtn.IsEnabled = true;
        PinInputPanel.Visibility = Visibility.Visible;
        LockoutWarningText.Visibility = Visibility.Visible;
        PinBox.PasswordChanged -= PinBox_PasswordChanged;
        try { PinBox.Password = ""; }
        finally { PinBox.PasswordChanged += PinBox_PasswordChanged; }
        _loadCertsCts?.Cancel();
        UpdateCertRowVisibility();
    }

    private void ClearPinCache()
    {
        _cachedPin = null;
        _cachedTokenId = null;
        PinCacheStorage.Delete();
    }

    private static string ComputeTokenId(string dllPath, List<CertInfo> certs)
    {
        var serials = string.Join(",", certs.OrderBy(c => c.Serial).Select(c => c.Serial ?? ""));
        return dllPath + "|" + serials;
    }

    private async Task TryAutoVerifyWithCachedPinAsync()
    {
        if (string.IsNullOrEmpty(_cachedPin))
        {
            var (storedTokenId, storedPin) = PinCacheStorage.Load();
            if (string.IsNullOrEmpty(storedPin)) return;
            _cachedPin = storedPin;
            _cachedTokenId = storedTokenId;
        }

        _loadCertsCts?.Cancel();
        _loadCertsCts = new CancellationTokenSource();
        var ct = _loadCertsCts.Token;

        CertLoadingPanel.Visibility = Visibility.Visible;
        try
        {
            var (dllPath, certs, stdout, stderr) = await _core.ListCertsAsync(null, _cachedPin);
            if (ct.IsCancellationRequested) return;

            var validCerts = certs.Where(c => c.IsValid).ToList();
            if (validCerts.Count == 0)
            {
                ClearPinCache();
                return;
            }

            var tokenId = ComputeTokenId(dllPath, validCerts);
            if (tokenId != _cachedTokenId)
            {
                ClearPinCache();
                return;
            }

            _dllPath = dllPath;
            foreach (var c in validCerts) _certs.Add(c);
            _pinVerified = true;
            ApplyPreferredCertSelection();
            CertCombo.IsEnabled = true;
            SignBtn.IsEnabled = true;
            PinInputPanel.Visibility = Visibility.Collapsed;
            LockoutWarningText.Visibility = Visibility.Collapsed;
            VerifyPinResultText.Text = "✓ Đã dùng PIN đã lưu.";
            VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#22C55E"));
            VerifyPinResultText.Visibility = Visibility.Visible;
            UpdateCertRowVisibility();
            LogService.Signing($"PIN cache OK, certs={validCerts.Count}");
        }
        catch
        {
            ClearPinCache();
        }
        finally
        {
            if (!ct.IsCancellationRequested)
            {
                CertLoadingPanel.Visibility = Visibility.Collapsed;
                if (!_pinVerified)
                    SignBtn.IsEnabled = true;
                UpdateCertRowVisibility();
            }
        }
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
        if (ex.Message.Contains("CLAIM_ALREADY_USED", StringComparison.OrdinalIgnoreCase))
            return "Liên kết ký đã được mở ở thiết bị khác. Vui lòng tạo phiên ký mới.";
        if (ex.Message.Contains("INVALID_CLAIM_CODE", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("401"))
            return "Mã claim không đúng hoặc đã hết hạn.";
        if (ex.Message.Contains("JOB_EXPIRED", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("410"))
            return "Phiên ký đã hết hạn. Vui lòng tạo lại phiên ký trên website.";
        if (ex.Message.Contains("INVALID_JOB_TOKEN", StringComparison.OrdinalIgnoreCase))
            return "Phiên ký không hợp lệ. Vui lòng mở lại từ website.";
        if (ex.Message.Contains("FILE_TOO_LARGE", StringComparison.OrdinalIgnoreCase))
            return "File PDF đã ký vượt quá giới hạn hệ thống (25MB).";
        if (ex.Message.Contains("404"))
            return "Job không tồn tại hoặc đã hết hạn.";
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
        SignBtn.IsEnabled = true;
        CertLoadingPanel.Visibility = Visibility.Collapsed;
        ClearPinCache();
        UpdateCertRowVisibility();
    }

    private async void PinBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        e.Handled = true;
        await RunInteractiveSignFlowAsync();
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
                _cachedPin = pin;
                _cachedTokenId = ComputeTokenId(dllPath, validCerts);
                PinCacheStorage.Save(_cachedTokenId, pin);
                ApplyPreferredCertSelection();
                CertCombo.IsEnabled = true;
                SignBtn.IsEnabled = true;
                PinInputPanel.Visibility = Visibility.Collapsed;
                LockoutWarningText.Visibility = Visibility.Collapsed;
                VerifyPinResultText.Text = "✓ PIN đúng. Đã tải chứng thư số.";
                VerifyPinResultText.Foreground = new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#22C55E"));
                VerifyPinResultText.Visibility = Visibility.Visible;
                UpdateCertRowVisibility();
                LogService.Signing($"PIN nhập tay OK, certs={validCerts.Count}");
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
                ClearPinCache();
                LogService.Signing($"PIN/Core lỗi: {msg}");
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
            {
                CertLoadingPanel.Visibility = Visibility.Collapsed;
                if (!_pinVerified)
                    SignBtn.IsEnabled = true;
                UpdateCertRowVisibility();
            }
        }
    }

    private async void Sign_Click(object sender, RoutedEventArgs e)
    {
        await RunInteractiveSignFlowAsync();
    }

    private async Task RunInteractiveSignFlowAsync()
    {
        if (_signFlowBusy) return;
        _signFlowBusy = true;
        try
        {
            if (_job == null) return;

            if (!_pinVerified)
            {
                if (string.IsNullOrEmpty(PinBox.Password))
                {
                    VerifyPinResultText.Text = "Vui lòng nhập mã PIN.";
                    VerifyPinResultText.Foreground = (System.Windows.Media.Brush)FindResource("TextSecondaryBrush");
                    VerifyPinResultText.Visibility = Visibility.Visible;
                    return;
                }

                await VerifyAndLoadCertsAsync();
                if (!_pinVerified) return;

                if (_certs.Count > 1)
                {
                    VerifyPinResultText.Text = "Chọn chứng chỉ, sau đó nhấn Ký số.";
                    VerifyPinResultText.Foreground = new SolidColorBrush(
                        (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#3B82F6")!);
                    VerifyPinResultText.Visibility = Visibility.Visible;
                    return;
                }
            }

            if (_certs.Count == 0)
            {
                System.Windows.MessageBox.Show(
                    "Chưa có chứng chỉ hợp lệ. Kiểm tra PIN và token USB.",
                    "PDFSignPro Signer",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                return;
            }

            if (CertCombo.SelectedItem is not CertInfo)
                ApplyPreferredCertSelection();
            if (CertCombo.SelectedItem is not CertInfo cert)
            {
                System.Windows.MessageBox.Show(
                    "Vui lòng chọn chứng chỉ.",
                    "PDFSignPro Signer",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                return;
            }

            var pin = _cachedPin ?? PinBox.Password;
            if (string.IsNullOrEmpty(pin))
            {
                System.Windows.MessageBox.Show(
                    "Vui lòng nhập mã PIN.",
                    "PDFSignPro Signer",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                return;
            }

            await RunSignPipelineAsync(cert, pin);
        }
        finally
        {
            _signFlowBusy = false;
        }
    }

    private async Task RunSignPipelineAsync(CertInfo cert, string pin)
    {
        if (_job == null) return;

        if (string.IsNullOrEmpty(_dllPath))
        {
            System.Windows.MessageBox.Show(
                "Chưa sẵn sàng ký. Nhập PIN đúng rồi nhấn Ký số lại.",
                "PDFSignPro Signer",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        if (!_core.CoreExists)
        {
            System.Windows.MessageBox.Show(
                "Không tìm thấy PDFSignProSignerCore.exe.",
                "PDFSignPro Signer",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
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
        var job = _job!;

        try
        {
            LogService.Signing(
                $"Bắt đầu ký: serial={cert.Serial} CN={cert.SubjectCN} job={job.DocumentTitle}");
            var templateId = _templateManager.SelectedTemplate?.Id ?? "valid";
            var result = await _core.SignAsync(
                _inputPdfPath,
                outputPath,
                _dllPath,
                cert.Index,
                pin,
                job.Placement.Page,
                job.Placement.Rect,
                templateId,
                _sealImagePath
            );

            logLines.Add(result.Stdout);
            if (!string.IsNullOrEmpty(result.Stderr)) logLines.Add(result.Stderr);
            SigningLog.Text = string.Join("\n", logLines);

            if (!result.Success)
            {
                ClearPinCache();
                ShowScreen(Screen.Sign);
                SignErrorText.Text = result.Stderr ?? result.Stdout ?? $"Lỗi (exit {result.ExitCode})";
                SignErrorText.Visibility = Visibility.Visible;
                SignBtn.IsEnabled = _certs.Count > 0;
                CertCombo.IsEnabled = _certs.Count > 0;
                PinBox.IsEnabled = true;
                LogService.Signing(
                    $"Ký PDF thất bại: exit={result.ExitCode} stderr={result.Stderr ?? result.Stdout}");
                return;
            }

            SigningText.Text = "Đang tải lên server...";
            var signingTime = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
            (_signedPublicUrl, _signedDownloadUrl) = await _api.CompleteAsync(
                job,
                outputPath,
                cert.SubjectO ?? "",
                cert.SubjectCN ?? "",
                cert.IssuerCN,
                cert.Serial,
                signingTime
            );

            ShowScreen(Screen.Success);
            UpdateSuccessButtons();

            LogService.Signing("Ký thành công, đã upload server.");
            await Task.Delay(450);
            if (System.Windows.Application.Current is App app)
            {
                app.HideMainWindowAfterSignSuccess(
                    "Đã ký xong — xem kết quả trên trình duyệt. Double-click icon khay để mở lại Signer.",
                    _appSettings.RemindUnplugTokenAfterSign);
            }
            else
                WindowState = WindowState.Minimized;
        }
        catch (Exception ex)
        {
            logLines.Add(ex.Message);
            SigningLog.Text = string.Join("\n", logLines);
            ShowScreen(Screen.Sign);
            SignErrorText.Text = GetFriendlyMessage(ex);
            SignErrorText.Visibility = Visibility.Visible;
            LogService.Signing($"Lỗi sau ký/upload: {ex.Message}");
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
        var dlg = new Microsoft.Win32.SaveFileDialog
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

            var result = System.Windows.MessageBox.Show(
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
            System.Windows.MessageBox.Show(msg, "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
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
            System.Windows.MessageBox.Show(msg, "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Warning);
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

    public void BringWindowToFront()
    {
        ShowInTaskbar = true;
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
