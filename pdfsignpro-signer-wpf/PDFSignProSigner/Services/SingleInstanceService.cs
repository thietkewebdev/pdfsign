using System.IO;
using System.IO.Pipes;
using System.Text;

namespace PDFSignProSigner.Services;

/// <summary>Single instance: Mutex + Named Pipe. Second launch sends deeplink to first and exits.</summary>
public class SingleInstanceService : IDisposable
{
    private const string MutexName = "PDFSignProSigner_SingleInstance";
    private const string PipeName = "PDFSignProSigner_DeepLinkPipe";
    private Mutex? _mutex;
    private CancellationTokenSource? _pipeCts;
    private Task? _pipeTask;

    /// <summary>Try to acquire single instance. Returns false if another instance owns it.</summary>
    public bool TryAcquire()
    {
        _mutex = new Mutex(true, MutexName, out var created);
        return created;
    }

    /// <summary>Start listening for deeplinks from second instances.</summary>
    public void StartListening(Action<string> onDeepLinkReceived)
    {
        _pipeCts = new CancellationTokenSource();
        _pipeTask = Task.Run(async () =>
        {
            while (!_pipeCts.Token.IsCancellationRequested)
            {
                try
                {
                    using var server = new NamedPipeServerStream(PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    await server.WaitForConnectionAsync(_pipeCts.Token);
                    using var reader = new StreamReader(server, Encoding.UTF8);
                    var line = await reader.ReadLineAsync(_pipeCts.Token);
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        try { onDeepLinkReceived(line.Trim()); }
                        catch { /* ignore */ }
                    }
                }
                catch (OperationCanceledException) { break; }
                catch (ObjectDisposedException) { break; }
                catch { /* retry */ }
            }
        }, _pipeCts.Token);
    }

    /// <summary>Send deeplink to existing instance. Returns true if sent successfully.</summary>
    public static bool SendToExistingInstance(string deeplink)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(2000);
            using var writer = new StreamWriter(client, Encoding.UTF8) { AutoFlush = true };
            writer.WriteLine(deeplink);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public void Dispose()
    {
        _pipeCts?.Cancel();
        _mutex?.ReleaseMutex();
        _mutex?.Dispose();
    }
}
