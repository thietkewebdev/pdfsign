using System.Windows;
using System.Windows.Threading;
using PDFSignProSigner.Services;

namespace PDFSignProSigner;

public partial class App : Application
{
    private SingleInstanceService? _singleInstance;
    private MainWindow? _mainWindow;

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
            MessageBox.Show("PDFSignPro Signer is already running.", "PDFSignPro Signer", MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown(1);
            return;
        }

        _mainWindow = new MainWindow();
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
        _singleInstance?.Dispose();
        base.OnExit(e);
    }
}
