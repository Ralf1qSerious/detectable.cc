using System.Windows.Forms;
using DetectableLV;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string serverUrl = "https://detectable.cc";
        if (args.Length >= 1 && args[0].StartsWith("http", StringComparison.OrdinalIgnoreCase))
            serverUrl = args[0].TrimEnd('/');

        Application.Run(new MainForm(serverUrl));
    }
}
