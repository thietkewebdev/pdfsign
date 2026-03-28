using System.Drawing;
using System.Windows;
using System.Windows.Forms;

namespace PDFSignProSigner.Services;

/// <summary>
/// Biểu tượng khay hệ thống: ẩn cửa sổ khỏi taskbar sau khi ký, mở lại bằng double-click hoặc menu.
/// </summary>
public sealed class TrayIconService : IDisposable
{
    private readonly Window _window;
    private readonly Action _exitApplication;
    private readonly NotifyIcon _notifyIcon;
    private readonly Icon _icon;
    private bool _disposed;

    public TrayIconService(Window mainWindow, Action exitApplication)
    {
        _window = mainWindow;
        _exitApplication = exitApplication;
        _icon = LoadTrayIcon();

        _notifyIcon = new NotifyIcon
        {
            Icon = _icon,
            Text = "PDFSignPro Signer",
            Visible = true,
        };
        _notifyIcon.DoubleClick += OnTrayDoubleClick;
        var menu = new ContextMenuStrip();
        menu.Items.Add("Mở PDFSignPro Signer", null, (_, _) => RestoreWindow());
        menu.Items.Add("Thoát", null, (_, _) => _exitApplication());
        _notifyIcon.ContextMenuStrip = menu;
    }

    private void OnTrayDoubleClick(object? sender, EventArgs e) => RestoreWindow();

    private static Icon LoadTrayIcon()
    {
        try
        {
            var path = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(path))
            {
                var extracted = Icon.ExtractAssociatedIcon(path);
                if (extracted != null)
                    return extracted;
            }
        }
        catch
        {
            /* ignore */
        }

        return SystemIcons.Application;
    }

    public void ShowInfoBalloon(string title, string text, int timeoutMs = 6000)
    {
        void Core()
        {
            _notifyIcon.ShowBalloonTip(
                timeoutMs,
                title,
                text,
                ToolTipIcon.Info);
        }

        if (_window.Dispatcher.CheckAccess())
            Core();
        else
            _window.Dispatcher.Invoke(Core);
    }

    public void HideWindowToTray(string? balloonMessage = null)
    {
        void Core()
        {
            _window.ShowInTaskbar = false;
            _window.Hide();
            if (!string.IsNullOrWhiteSpace(balloonMessage))
            {
                _notifyIcon.ShowBalloonTip(
                    5000,
                    "PDFSignPro Signer",
                    balloonMessage,
                    ToolTipIcon.Info);
            }
        }

        if (_window.Dispatcher.CheckAccess())
            Core();
        else
            _window.Dispatcher.Invoke(Core);
    }

    public void RestoreWindow()
    {
        void Core()
        {
            _window.ShowInTaskbar = true;
            _window.Show();
            if (_window.WindowState == WindowState.Minimized)
                _window.WindowState = WindowState.Normal;
            if (_window is MainWindow mw)
                mw.BringWindowToFront();
            else
            {
                _window.Activate();
                _window.Focus();
            }
        }

        if (_window.Dispatcher.CheckAccess())
            Core();
        else
            _window.Dispatcher.Invoke(Core);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _notifyIcon.Visible = false;
        _notifyIcon.DoubleClick -= OnTrayDoubleClick;
        _notifyIcon.ContextMenuStrip?.Dispose();
        _notifyIcon.ContextMenuStrip = null;
        _notifyIcon.Icon = null;
        _notifyIcon.Dispose();
        if (!ReferenceEquals(_icon, SystemIcons.Application))
            _icon.Dispose();
    }
}
