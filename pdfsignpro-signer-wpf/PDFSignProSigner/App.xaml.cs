using System.Windows;
using System.Windows.Threading;
using PDFSignProSigner.Services;

namespace PDFSignProSigner;

public partial class App : System.Windows.Application
{
    private SingleInstanceService? _singleInstance;
    private MainWindow? _mainWindow;
    private TrayIconService? _trayIcon;
    private LocalBridgeService? _localBridge;

    /// <summary>Ẩn cửa sổ xuống khay sau khi ký thành công; tuỳ chọn balloon nhắc rút USB.</summary>
    public void HideMainWindowAfterSignSuccess(string? balloonMessage, bool remindUnplugUsb)
    {
        _trayIcon?.HideWindowToTray(balloonMessage);
        if (!remindUnplugUsb || _trayIcon == null) return;

        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.8) };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            _trayIcon?.ShowInfoBalloon(
                "PDFSignPro Signer",
                "Bảo mật: nhớ rút USB token khi không ký nữa.");
        };
        timer.Start();
    }

    private void App_OnStartup(object sender, StartupEventArgs e)
    {
        var deeplink = DeepLinkService.ExtractFromArgs(e.Args);

        _singleInstance = new SingleInstanceService();
        if (!_singleInstance.TryAcquire())
        {
            LogService.Info("Second instance detected");
            if (!string.IsNullOrEmpty(deeplink) && SingleInstanceService.SendToExistingInstance(deeplink))
            {
                LogService.Info("Forwarded deeplink to first instance, exiting");
                Shutdown(0);
                return;
            }
            System.Windows.MessageBox.Show("PDFSignPro Signer is already running.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown(1);
            return;
        }

        _mainWindow = new MainWindow();
        _trayIcon = new TrayIconService(_mainWindow, () => Shutdown(0));
        _localBridge = new LocalBridgeService(new CoreService());
        _localBridge.Start();
        _singleInstance.StartListening(url =>
        {
            Dispatcher.Invoke(() =>
            {
                _mainWindow?.ProcessDeepLink(url);
            });
        });

        _mainWindow.Show();
        if (!string.IsNullOrEmpty(deeplink))
        {
            Dispatcher.BeginInvoke(() => _mainWindow.ProcessDeepLink(deeplink), DispatcherPriority.Loaded);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _localBridge?.Dispose();
        _trayIcon?.Dispose();
        _singleInstance?.Dispose();
        base.OnExit(e);
    }
}
