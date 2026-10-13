// Zen desktop launcher: serves the bundled site on localhost and opens it in an Edge app window.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Zen {
  const int Port = 47321; // fixed, so the browser keeps your writing and board between runs

  static readonly Dictionary<string, string> Types = new Dictionary<string, string> {
    {".html", "text/html; charset=utf-8"}, {".js", "text/javascript; charset=utf-8"},
    {".css", "text/css; charset=utf-8"}, {".mp3", "audio/mpeg"}, {".svg", "image/svg+xml"},
    {".png", "image/png"}, {".ico", "image/x-icon"}, {".json", "application/json"}
  };

  [STAThread]
  static void Main() {
    TcpListener listener;
    try { listener = new TcpListener(IPAddress.Loopback, Port); listener.Start(); }
    catch (SocketException) { listener = null; } // already running: just open another window
    if (listener != null) new Thread(() => Serve(listener)) { IsBackground = true }.Start();

    string edge = FindEdge();
    string url = "http://127.0.0.1:" + Port + "/";
    if (edge == null) { Process.Start(url); if (listener != null) Thread.Sleep(Timeout.Infinite); return; }
    string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zen", "browser");
    var p = Process.Start(edge, "--app=" + url + " --user-data-dir=\"" + profile + "\" --no-first-run --window-size=1280,860");
    if (listener == null) return;
    p.WaitForExit();
    Thread.Sleep(5000);
    // Edge locks this file in the Zen profile while any Zen window is open; serve until it is released.
    while (ProfileInUse(Path.Combine(profile, "lockfile"))) Thread.Sleep(2000);
  }

  static bool ProfileInUse(string lockfile) {
    if (!File.Exists(lockfile)) return false;
    try { using (File.Open(lockfile, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) return false; }
    catch (IOException) { return true; }
    catch { return false; }
  }

  static string FindEdge() {
    foreach (var root in new[] { Environment.GetEnvironmentVariable("ProgramFiles(x86)"), Environment.GetEnvironmentVariable("ProgramFiles"),
                                 Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) }) {
      if (root == null) continue;
      string path = Path.Combine(root, @"Microsoft\Edge\Application\msedge.exe");
      if (File.Exists(path)) return path;
    }
    return null;
  }

  static void Serve(TcpListener listener) {
    while (true) {
      var client = listener.AcceptTcpClient();
      ThreadPool.QueueUserWorkItem(_ => Handle(client));
    }
  }

  static void Handle(TcpClient client) {
    using (client)
    using (var stream = client.GetStream()) {
      try {
        var reader = new StreamReader(stream, Encoding.ASCII);
        string request = reader.ReadLine() ?? "";
        string range = null, line;
        while (!string.IsNullOrEmpty(line = reader.ReadLine()))
          if (line.StartsWith("Range:", StringComparison.OrdinalIgnoreCase)) range = line.Substring(6).Trim();
        string[] parts = request.Split(' ');
        string path = parts.Length > 1 ? Uri.UnescapeDataString(parts[1].Split('?')[0]) : "/";
        if (path == "/") path = "/index.html";
        byte[] body = Load(path.TrimStart('/'));
        if (body == null) { Write(stream, "404 Not Found", "text/plain", Encoding.ASCII.GetBytes("Not found"), 0, 9, null); return; }
        string ext = Path.GetExtension(path).ToLowerInvariant();
        string type = Types.ContainsKey(ext) ? Types[ext] : "application/octet-stream";
        long start = 0, end = body.Length - 1;
        if (range != null && range.StartsWith("bytes=")) { // audio seeking
          string[] r = range.Substring(6).Split('-');
          if (r[0] != "") start = long.Parse(r[0]);
          if (r.Length > 1 && r[1] != "") end = Math.Min(long.Parse(r[1]), end);
          Write(stream, "206 Partial Content", type, body, start, end, "Content-Range: bytes " + start + "-" + end + "/" + body.Length);
        } else Write(stream, "200 OK", type, body, start, end, null);
      } catch {}
    }
  }

  static void Write(Stream s, string status, string type, byte[] body, long start, long end, string extra) {
    long length = end - start + 1;
    string head = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + length +
                  "\r\nAccept-Ranges: bytes\r\nCache-Control: no-cache\r\nConnection: close\r\n" + (extra != null ? extra + "\r\n" : "") + "\r\n";
    byte[] h = Encoding.ASCII.GetBytes(head);
    s.Write(h, 0, h.Length);
    s.Write(body, (int)start, (int)length);
  }

  static byte[] Load(string name) {
    if (name.Contains("..")) return null;
    using (var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("site/" + name)) {
      if (res == null) return null;
      var ms = new MemoryStream();
      res.CopyTo(ms);
      return ms.ToArray();
    }
  }
}
