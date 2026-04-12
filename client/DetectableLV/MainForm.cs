using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Windows.Forms;
using DetectableLV.Models;

namespace DetectableLV;

/// <summary>Blue-themed GUI scanner client — detectable.cc v4</summary>
public class MainForm : Form
{
    // ── Electric-blue palette ───────────────────────────────────────────
    static readonly Color C_Bg      = Color.FromArgb(8,   12,  22);
    static readonly Color C_Bg2     = Color.FromArgb(13,  18,  32);
    static readonly Color C_Bg3     = Color.FromArgb(18,  26,  44);
    static readonly Color C_Bg4     = Color.FromArgb(24,  34,  56);
    static readonly Color C_Border  = Color.FromArgb(28,  40,  68);
    static readonly Color C_Border2 = Color.FromArgb(36,  52,  86);
    static readonly Color C_Accent  = Color.FromArgb(41, 151, 255);
    static readonly Color C_Accent2 = Color.FromArgb(20, 112, 210);
    static readonly Color C_AccentL = Color.FromArgb(80, 180, 255);
    static readonly Color C_Text    = Color.FromArgb(220, 232, 252);
    static readonly Color C_Muted   = Color.FromArgb(98,  120, 162);
    static readonly Color C_Dim     = Color.FromArgb(52,  68,  100);
    static readonly Color C_Green   = Color.FromArgb(46,  204, 113);
    static readonly Color C_Yellow  = Color.FromArgb(243, 156, 18);
    static readonly Color C_Red     = Color.FromArgb(231, 76,  60);

    // ── Layout ─────────────────────────────────────────────────────────
    const int W  = 520;
    const int H  = 620;
    const int TB = 50;
    const int PH = H - TB;

    // ── Panels ─────────────────────────────────────────────────────────
    Panel _pnlToken   = null!;
    Panel _pnlConsent = null!;
    Panel _pnlScan    = null!;
    Panel _pnlDone    = null!;

    // Token panel
    TextBox   _tbToken    = null!;
    Label     _lblErr     = null!;
    DlvButton _btnConnect = null!;

    // Scan panel
    DlvProgressBar _pb      = null!;
    Label          _lblStep = null!;
    Label          _lblPct  = null!;
    RichTextBox    _logBox  = null!;

    // Done panel
    Label      _lblDoneIcon  = null!;
    Label      _lblDoneTitle = null!;
    Label      _lblDoneSub   = null!;
    DlvRiskBar _riskBar      = null!;

    // Spinner
    System.Windows.Forms.Timer _spinTimer = null!;
    float _spinAngle = -90f;

    // Dragging
    Point _drag;

    readonly string _serverUrl;
    string _sessionId    = "";
    string _targetName   = "";
    string _checkerName  = "";
    Color  _doneRiskColor;

    // ── Constructor ────────────────────────────────────────────────────
    public MainForm(string serverUrl = "https://detectable.cc")
    {
        _serverUrl     = serverUrl;
        _doneRiskColor = Color.FromArgb(46, 204, 113); // default green
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        Build();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            const int CS_DROPSHADOW = 0x20000;
            var cp = base.CreateParams;
            cp.ClassStyle |= CS_DROPSHADOW;
            return cp;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Form construction
    // ═══════════════════════════════════════════════════════════════════
    void Build()
    {
        SuspendLayout();
        Text            = "detectable.cc";
        FormBorderStyle = FormBorderStyle.None;
        BackColor       = C_Bg;
        Size            = new Size(W, H);
        StartPosition   = FormStartPosition.CenterScreen;
        Font            = new Font("Segoe UI", 9.5f);
        ForeColor       = C_Text;

        Paint += (_, e) =>
        {
            using var p = new Pen(C_Border, 1);
            e.Graphics.DrawRectangle(p, 0, 0, W - 1, H - 1);
        };

        // Title bar
        var tb = new Panel { Bounds = new Rectangle(0, 0, W, TB), BackColor = C_Bg2 };
        tb.Paint     += DrawTitleBar;
        tb.MouseDown += (_, e) => _drag = e.Location;
        tb.MouseMove += (_, e) =>
        {
            if (e.Button != MouseButtons.Left) return;
            Location = new Point(Left + e.X - _drag.X, Top + e.Y - _drag.Y);
        };

        var btnMin = MakeTitleBarBtn("─", W - 92, 0, 46, TB);
        btnMin.Click += (_, _) => WindowState = FormWindowState.Minimized;
        tb.Controls.Add(btnMin);

        var btnX = MakeTitleBarBtn("×", W - 46, 0, 46, TB, hoverColor: C_Red);
        btnX.Click += (_, _) => Application.Exit();
        tb.Controls.Add(btnX);
        Controls.Add(tb);

        // Spinner timer
        _spinTimer = new System.Windows.Forms.Timer { Interval = 16 };
        _spinTimer.Tick += (_, _) =>
        {
            _spinAngle = (_spinAngle + 5f) % 360f;
            _pnlScan.Invalidate();
        };

        var bounds = new Rectangle(0, TB, W, PH);
        _pnlToken   = MakeTokenPanel();
        _pnlConsent = MakeConsentPanel();
        _pnlScan    = MakeScanPanel();
        _pnlDone    = MakeDonePanel();

        foreach (var p in new[] { _pnlToken, _pnlConsent, _pnlScan, _pnlDone })
        {
            p.Bounds  = bounds;
            p.Visible = false;
            Controls.Add(p);
        }
        _pnlToken.Visible = true;
        ResumeLayout(false);
    }

    Button MakeTitleBarBtn(string text, int x, int y, int w, int h, Color? hoverColor = null)
    {
        var hover = hoverColor ?? C_Bg4;
        var btn = new Button
        {
            Text      = text,
            Bounds    = new Rectangle(x, y, w, h),
            BackColor = Color.Transparent,
            ForeColor = C_Muted,
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 13f),
            Cursor    = Cursors.Hand,
            TabStop   = false,
        };
        btn.FlatAppearance.BorderSize         = 0;
        btn.FlatAppearance.MouseOverBackColor = hover;
        btn.MouseEnter += (_, _) => btn.ForeColor = Color.White;
        btn.MouseLeave += (_, _) => btn.ForeColor = C_Muted;
        return btn;
    }

    void DrawTitleBar(object? _, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using (var p = new Pen(C_Border, 1))
            g.DrawLine(p, 0, TB - 1, W, TB - 1);

        // Blue gradient accent line at top
        using (var br = new LinearGradientBrush(
            new Point(0, 0), new Point(W, 0),
            C_Accent, Color.FromArgb(0, C_Accent)))
            g.FillRectangle(br, 0, 0, W, 2);

        // Logo rings
        using (var b = new SolidBrush(Color.FromArgb(40, C_Accent)))
            g.FillEllipse(b, 12, 13, 24, 24);
        using (var b = new SolidBrush(Color.FromArgb(80, C_Accent)))
            g.FillEllipse(b, 16, 17, 16, 16);
        using (var b = new SolidBrush(C_Accent))
            g.FillEllipse(b, 20, 21, 8, 8);

        using var fBold = new Font("Segoe UI Semibold", 11f);
        using var bText = new SolidBrush(C_Text);
        g.DrawString("detectable", fBold, bText, 42, 16);
        var sz = g.MeasureString("detectable", fBold);
        using var fTld = new Font("Segoe UI", 11f);
        using var bTld = new SolidBrush(C_Accent);
        g.DrawString(".cc", fTld, bTld, 42 + sz.Width - 4, 16);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Panel 1 — Token entry
    // ═══════════════════════════════════════════════════════════════════
    Panel MakeTokenPanel()
    {
        var panel = DarkPanel();
        panel.Paint += (_, e) => DrawTokenBg(e.Graphics);

        panel.Controls.Add(SmallLabel("SESSION TOKEN", 44, 190, 412));

        var tbWrap = new Panel { Bounds = new Rectangle(44, 210, 412, 46), BackColor = C_Bg3 };
        tbWrap.Paint += (_, e) =>
        {
            using var p = new Pen(_tbToken.Focused ? C_Accent : C_Border2, 1);
            e.Graphics.DrawRectangle(p, 0, 0, tbWrap.Width - 1, tbWrap.Height - 1);
        };
        _tbToken = new TextBox
        {
            Bounds          = new Rectangle(12, 12, 388, 22),
            BackColor       = C_Bg3,
            ForeColor       = C_Text,
            BorderStyle     = BorderStyle.None,
            Font            = new Font("Cascadia Code", 11.5f),
            PlaceholderText = "Paste your session token here…",
        };
        _tbToken.GotFocus  += (_, _) => tbWrap.Invalidate();
        _tbToken.LostFocus += (_, _) => tbWrap.Invalidate();
        _tbToken.KeyDown   += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; TryConnect(); }
        };
        tbWrap.Controls.Add(_tbToken);
        panel.Controls.Add(tbWrap);

        _lblErr = new Label
        {
            Bounds    = new Rectangle(44, 264, 412, 20),
            ForeColor = C_Red,
            BackColor = Color.Transparent,
            Font      = new Font("Segoe UI", 9f),
            AutoSize  = false,
        };
        panel.Controls.Add(_lblErr);

        var btnCancel = new DlvButton("Cancel", DlvButtonStyle.Ghost)
        {
            Bounds = new Rectangle(44, 318, 190, 44),
        };
        btnCancel.Click += (_, _) => Application.Exit();
        panel.Controls.Add(btnCancel);

        _btnConnect = new DlvButton("Connect  →", DlvButtonStyle.Primary)
        {
            Bounds = new Rectangle(246, 318, W - 246 - 44, 44),
        };
        _btnConnect.Click += (_, _) => TryConnect();
        panel.Controls.Add(_btnConnect);

        panel.Controls.Add(new Label
        {
            Text      = "v4  ·  detectable.cc",
            Bounds    = new Rectangle(0, PH - 30, W, 20),
            ForeColor = C_Dim,
            Font      = new Font("Segoe UI", 8f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleCenter,
            AutoSize  = false,
        });

        return panel;
    }

    void DrawTokenBg(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;

        // Icon halo
        using (var b = new SolidBrush(Color.FromArgb(28, C_Accent)))
            g.FillEllipse(b, W / 2 - 34, 20, 68, 68);
        using (var p = new Pen(Color.FromArgb(60, C_Accent), 1.5f))
            g.DrawEllipse(p, W / 2 - 26, 28, 52, 52);

        // Lock body
        using (var b = new SolidBrush(C_Bg4))
            g.FillEllipse(b, W / 2 - 20, 34, 40, 40);
        using (var p = new Pen(C_AccentL, 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawArc(p, W / 2 - 8, 36, 16, 16, 180, 180);
        using (var b = new SolidBrush(C_Accent))
            g.FillRectangle(b, W / 2 - 9, 48, 18, 14);
        using (var b = new SolidBrush(C_Bg4))
            g.FillEllipse(b, W / 2 - 4, 51, 8, 8);

        // Title
        using var fTitle = new Font("Segoe UI Semibold", 18f);
        using var bTitle = new SolidBrush(C_Text);
        CenterString(g, "Session Verification", fTitle, bTitle, 96, W);

        using var fSub = new Font("Segoe UI", 10f);
        using var bSub = new SolidBrush(C_Muted);
        CenterString(g, "Paste the token provided by your checker to begin", fSub, bSub, 126, W);

        using var dp = new Pen(C_Border, 1);
        g.DrawLine(dp, 44, 162, W - 44, 162);

        using var fHint = new Font("Cascadia Code", 7.5f);
        using var bHint = new SolidBrush(C_Dim);
        CenterString(g, $"◉  {_serverUrl}", fHint, bHint, 174, W);

        // Session context banner (shown after successful token verify)
        if (!string.IsNullOrEmpty(_targetName))
        {
            var bannerRect = new Rectangle(44, 290, W - 88, 20);
            using var fCtx = new Font("Segoe UI", 8.5f);
            using var bCtx = new SolidBrush(C_Accent);
            using var bCtxM = new SolidBrush(C_Muted);
            g.DrawString("✓  Session found · ", fCtx, bCtx, 44, 290);
            var checkSz = g.MeasureString("✓  Session found · ", fCtx);
            g.DrawString($"Player: {_targetName}", fCtx, bCtxM, 44 + checkSz.Width, 290);
        }
    }

    async void TryConnect()
    {
        var tkn = _tbToken.Text.Trim();
        if (string.IsNullOrWhiteSpace(tkn))
        {
            _lblErr.Text = "⚠  Please paste the session token first.";
            return;
        }
        _sessionId          = tkn;
        _lblErr.Text        = "";
        _btnConnect.Enabled = false;
        _btnConnect.Text    = "Verifying…";

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var res = await http.GetAsync($"{_serverUrl}/api/verify/{_sessionId}");
            if (!res.IsSuccessStatusCode)
            {
                _lblErr.Text        = "⚠  Invalid or expired session token.";
                _btnConnect.Enabled = true;
                _btnConnect.Text    = "Connect  →";
                return;
            }
            // Parse session info for context display
            try
            {
                var body = await res.Content.ReadAsStringAsync();
                var doc  = System.Text.Json.JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("session", out var sess))
                {
                    if (sess.TryGetProperty("targetName", out var tn)) _targetName = tn.GetString() ?? "";
                    if (sess.TryGetProperty("createdBy",  out var cb)) _checkerName = cb.GetString() ?? "";
                    _pnlToken.Invalidate();
                }
            }
            catch { }
        }
        catch
        {
            _lblErr.Text        = "⚠  Cannot reach server. Check your connection.";
            _btnConnect.Enabled = true;
            _btnConnect.Text    = "Connect  →";
            return;
        }

        _btnConnect.Enabled = true;
        _btnConnect.Text    = "Connect  →";
        ShowPanel(_pnlConsent);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Panel 2 — Consent
    // ═══════════════════════════════════════════════════════════════════
    Panel MakeConsentPanel()
    {
        var panel = DarkPanel();
        panel.Paint += (_, e) => DrawConsentBg(e.Graphics);

        var items = new[]
        {
            "System info — OS, CPU, RAM, GPU, HWID, IP & MAC address",
            "Running processes and loaded DLL modules",
            "Active network connections and open ports",
            "Windows services and kernel drivers",
            "Scheduled tasks and startup registry entries",
            "Known cheat signatures and file paths",
            "Installed software and recent programs",
            "Primary monitor screenshot (one capture)",
        };

        int y = 210;
        foreach (var item in items)
        {
            panel.Controls.Add(new Label
            {
                Text      = "●",
                Bounds    = new Rectangle(48, y + 2, 12, 16),
                ForeColor = C_Accent,
                Font      = new Font("Segoe UI", 6.5f),
                BackColor = Color.Transparent,
                AutoSize  = false,
            });
            panel.Controls.Add(new Label
            {
                Text      = item,
                Bounds    = new Rectangle(66, y, W - 86, 18),
                ForeColor = C_Text,
                Font      = new Font("Segoe UI", 9f),
                BackColor = Color.Transparent,
                AutoSize  = false,
            });
            y += 26;
        }

        var notice = new Panel
        {
            Bounds    = new Rectangle(44, y + 10, W - 88, 34),
            BackColor = Color.FromArgb(12, 41, 151, 255),
        };
        notice.Paint += (_, e) =>
        {
            using var p = new Pen(Color.FromArgb(44, C_Accent), 1);
            e.Graphics.DrawRectangle(p, 0, 0, notice.Width - 1, notice.Height - 1);
            using var f = new Font("Segoe UI", 8.5f);
            using var b = new SolidBrush(C_Muted);
            e.Graphics.DrawString("Data is transmitted encrypted, only to the checker who issued your token.", f, b, 10, 9);
        };
        panel.Controls.Add(notice);

        var btnDecline = new DlvButton("← Back", DlvButtonStyle.Ghost)
        {
            Bounds = new Rectangle(44, 480, 190, 44),
        };
        btnDecline.Click += (_, _) => ShowPanel(_pnlToken);
        panel.Controls.Add(btnDecline);

        var btnAccept = new DlvButton("Accept & Scan  →", DlvButtonStyle.Success)
        {
            Bounds = new Rectangle(246, 480, W - 246 - 44, 44),
        };
        btnAccept.Click += (_, _) => BeginScan();
        panel.Controls.Add(btnAccept);

        return panel;
    }

    void DrawConsentBg(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using (var b = new SolidBrush(Color.FromArgb(30, C_Yellow)))
            g.FillEllipse(b, 38, 20, 40, 40);
        using var fIcon = new Font("Segoe UI", 20f);
        using var bIcon = new SolidBrush(C_Yellow);
        g.DrawString("⚠", fIcon, bIcon, 40, 22);

        using var fTitle = new Font("Segoe UI Semibold", 15f);
        using var bTitle = new SolidBrush(C_Text);
        g.DrawString("Review & Accept", fTitle, bTitle, 90, 24);

        using var fSub = new Font("Segoe UI", 9.5f);
        using var bSub = new SolidBrush(C_Muted);
        g.DrawString("The following data will be collected and sent to the checker:", fSub, bSub, 44, 82);

        using var dp = new Pen(C_Border, 1);
        g.DrawLine(dp, 44, 116, W - 44, 116);

        using var fSec = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        using var bSec = new SolidBrush(C_Dim);
        g.DrawString("DATA COLLECTED", fSec, bSec, 44, 128);
        g.DrawString("8 CATEGORIES", fSec, bSec, W - 118, 128);

        // Session context pill (only once token is verified)
        if (!string.IsNullOrEmpty(_checkerName) || !string.IsNullOrEmpty(_targetName))
        {
            var pillRect = new RectangleF(44, 148, W - 88, 44);
            using (var bg = new SolidBrush(Color.FromArgb(22, 41, 151, 255)))
            {
                g.FillRectangle(bg, pillRect);
            }
            using (var border = new Pen(Color.FromArgb(50, C_Accent), 1))
                g.DrawRectangle(border, pillRect.X, pillRect.Y, pillRect.Width - 1, pillRect.Height - 1);

            using var fPill  = new Font("Segoe UI", 8.5f);
            using var fLabel = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            using var bLabel = new SolidBrush(C_Accent);
            using var bVal   = new SolidBrush(C_Text);

            float cx = pillRect.X + 12;
            g.DrawString("Checker:", fLabel, bLabel, cx, pillRect.Y + 6);
            var labelSz = g.MeasureString("Checker:", fLabel);
            g.DrawString(string.IsNullOrEmpty(_checkerName) ? "—" : _checkerName, fPill, bVal, cx + labelSz.Width + 2, pillRect.Y + 6);

            g.DrawString("Player:",  fLabel, bLabel, cx, pillRect.Y + 24);
            var labelSz2 = g.MeasureString("Player:",  fLabel);
            g.DrawString(string.IsNullOrEmpty(_targetName)  ? "—" : _targetName,  fPill, bVal, cx + labelSz2.Width + 2, pillRect.Y + 24);
        }
    }

    async void BeginScan()
    {
        ShowPanel(_pnlScan);
        _pb.Value     = 0;
        _lblPct.Text  = "0%";
        _lblStep.Text = "Initializing scanner…";
        _logBox.Clear();
        _spinTimer.Start();

        const int totalSteps = 14;
        int step = 0;

        void Progress(string msg)
        {
            step++;
            int pct = (int)Math.Min(99, step * 100.0 / totalSteps);
            SafeInvoke(() =>
            {
                _lblStep.Text = msg;
                _lblPct.Text  = $"{pct}%";
                _pb.Value     = pct;
                AppendLog(msg);
            });
        }

        try
        {
            await ApiClient.NotifyStartAsync(_serverUrl, _sessionId);
            ScanResult result = await Task.Run(() => Scanner.Run(Progress));
            await ApiClient.SubmitResultAsync(_serverUrl, _sessionId, result);

            SafeInvoke(() =>
            {
                _spinTimer.Stop();
                // Choose icon + colour based on risk
                (string icon, Color iconColor, string title, string sub) = result.RiskLevel switch
                {
                    "critical" => ("!",  C_Red,    "Critical Risk Detected",
                        $"Results sent to checker.\n{result.FlaggedItems.Count} flagged item(s) — Risk score: {result.RiskScore}/100"),
                    "high"     => ("!",  C_Red,    "High Risk Detected",
                        $"Results sent to checker.\n{result.FlaggedItems.Count} flagged item(s) — Risk score: {result.RiskScore}/100"),
                    "medium"   => ("⚠",  C_Yellow, "Medium Risk",
                        $"Results sent to checker.\n{result.FlaggedItems.Count} flagged item(s) — Risk score: {result.RiskScore}/100"),
                    "low"      => ("✓",  C_Green,  "Low Risk",
                        $"Results sent to checker.\nRisk score: {result.RiskScore}/100"),
                    _          => ("✓",  C_Green,  "Scan Complete",
                        "Results have been sent to the checker.\nYou may now close this window."),
                };
                _lblDoneIcon.Text      = icon;
                _lblDoneIcon.ForeColor = iconColor;
                _lblDoneTitle.Text     = title;
                _lblDoneTitle.ForeColor = iconColor;
                _lblDoneSub.Text       = sub;
                _riskBar.RiskScore     = result.RiskScore;
                _riskBar.RiskLevel     = result.RiskLevel;
                _riskBar.Visible       = true;
                _doneRiskColor         = iconColor;
                _pnlDone.Invalidate();
                ShowPanel(_pnlDone);
            });
        }
        catch (Exception ex)
        {
            SafeInvoke(() =>
            {
                _spinTimer.Stop();
                _lblDoneIcon.Text       = "!";
                _lblDoneIcon.ForeColor  = C_Red;
                _lblDoneTitle.Text      = "Error";
                _lblDoneTitle.ForeColor = C_Red;
                _lblDoneSub.Text        = ex.Message;
                _riskBar.Visible        = false;
                _doneRiskColor          = C_Red;
                _pnlDone.Invalidate();
                ShowPanel(_pnlDone);
            });
        }
    }

    void AppendLog(string msg)
    {
        if (_logBox.TextLength > 0)
        {
            _logBox.SelectionStart  = _logBox.TextLength;
            _logBox.SelectionLength = 0;
            _logBox.SelectionColor  = C_Text;
            _logBox.AppendText("\n");
        }
        _logBox.SelectionStart  = _logBox.TextLength;
        _logBox.SelectionLength = 0;
        _logBox.SelectionColor  = C_Green;
        _logBox.AppendText("✓  ");
        _logBox.SelectionColor  = C_Text;
        _logBox.AppendText(msg);
        _logBox.ScrollToCaret();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Panel 3 — Scan progress
    // ═══════════════════════════════════════════════════════════════════
    Panel MakeScanPanel()
    {
        var panel = DarkPanel();
        panel.Paint += (_, e) => DrawScanBg(e.Graphics);

        panel.Controls.Add(new Label
        {
            Text      = "SCANNING SYSTEM",
            Bounds    = new Rectangle(44, 182, 240, 16),
            ForeColor = C_Muted,
            Font      = new Font("Segoe UI", 8f, FontStyle.Bold),
            BackColor = Color.Transparent,
            AutoSize  = false,
        });

        _lblPct = new Label
        {
            Text      = "0%",
            Bounds    = new Rectangle(W - 88, 182, 44, 16),
            ForeColor = C_Accent,
            Font      = new Font("Segoe UI Semibold", 8.5f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleRight,
            AutoSize  = false,
        };
        panel.Controls.Add(_lblPct);

        _pb = new DlvProgressBar { Bounds = new Rectangle(44, 204, W - 88, 8), Value = 0 };
        panel.Controls.Add(_pb);

        _lblStep = new Label
        {
            Text      = "Initializing…",
            Bounds    = new Rectangle(44, 220, W - 88, 18),
            ForeColor = C_Muted,
            Font      = new Font("Cascadia Code", 8.5f),
            BackColor = Color.Transparent,
            AutoSize  = false,
        };
        panel.Controls.Add(_lblStep);

        // Log area
        _logBox = new RichTextBox
        {
            Bounds      = new Rectangle(44, 252, W - 88, 250),
            BackColor   = C_Bg3,
            ForeColor   = C_Text,
            BorderStyle = BorderStyle.None,
            ReadOnly    = true,
            Font        = new Font("Cascadia Code", 8.5f),
            ScrollBars  = RichTextBoxScrollBars.Vertical,
            WordWrap    = false,
            Cursor      = Cursors.Default,
        };
        panel.Controls.Add(_logBox);

        // Log border overlay
        panel.Paint += (_, e) =>
        {
            using var p = new Pen(C_Border2, 1);
            e.Graphics.DrawRectangle(p, 43, 251, W - 87, 252);
        };

        return panel;
    }

    void DrawScanBg(Graphics g)
    {
        g.SmoothingMode      = SmoothingMode.AntiAlias;
        g.CompositingQuality = CompositingQuality.HighQuality;

        int cx = W / 2, cy = 80;
        int r1 = 44;

        // Glow halos
        using (var b = new SolidBrush(Color.FromArgb(18, C_Accent)))
            g.FillEllipse(b, cx - r1 - 8, cy - r1 - 8, (r1 + 8) * 2, (r1 + 8) * 2);
        using (var b = new SolidBrush(Color.FromArgb(10, C_Accent)))
            g.FillEllipse(b, cx - r1 - 16, cy - r1 - 16, (r1 + 16) * 2, (r1 + 16) * 2);

        // Track
        using (var p = new Pen(C_Bg4, 4f))
            g.DrawEllipse(p, cx - r1, cy - r1, r1 * 2, r1 * 2);

        // Animated sweep
        using (var p = new Pen(C_Accent, 4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawArc(p, cx - r1, cy - r1, r1 * 2, r1 * 2, _spinAngle, 260f);

        // Trailing ghost arc
        using (var p = new Pen(Color.FromArgb(60, C_AccentL), 4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawArc(p, cx - r1, cy - r1, r1 * 2, r1 * 2, _spinAngle + 260f, 60f);

        // Inner disk
        int r2 = 36;
        using (var b = new SolidBrush(C_Bg2))
            g.FillEllipse(b, cx - r2, cy - r2, r2 * 2, r2 * 2);

        // Center label ".cc"
        using var fDot = new Font("Segoe UI Semibold", 7.5f);
        using var bDot = new SolidBrush(C_Accent);
        var dotSz = g.MeasureString(".cc", fDot);
        g.DrawString(".cc", fDot, bDot, cx - dotSz.Width / 2, cy - dotSz.Height / 2);

        // Title + subtitle
        using var fTitle = new Font("Segoe UI Semibold", 16f);
        using var bTitle = new SolidBrush(C_Text);
        CenterString(g, "Scanning Your System", fTitle, bTitle, 138, W);

        using var fSub = new Font("Segoe UI", 9.5f);
        using var bSub = new SolidBrush(C_Muted);
        CenterString(g, "Please keep this window open. This takes 30–60 seconds.", fSub, bSub, 162, W);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Panel 4 — Done
    // ═══════════════════════════════════════════════════════════════════
    Panel MakeDonePanel()
    {
        var panel = DarkPanel();

        _lblDoneIcon = new Label
        {
            Text      = "✓",
            Bounds    = new Rectangle(0, 70, W, 90),
            ForeColor = C_Green,
            Font      = new Font("Segoe UI", 52f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleCenter,
            AutoSize  = false,
        };
        panel.Controls.Add(_lblDoneIcon);

        _lblDoneTitle = new Label
        {
            Text      = "Scan Complete",
            Bounds    = new Rectangle(0, 168, W, 36),
            ForeColor = C_Text,
            Font      = new Font("Segoe UI Semibold", 18f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleCenter,
            AutoSize  = false,
        };
        panel.Controls.Add(_lblDoneTitle);

        _riskBar = new DlvRiskBar
        {
            Bounds  = new Rectangle(80, 216, W - 160, 52),
            Visible = false,
        };
        panel.Controls.Add(_riskBar);

        _lblDoneSub = new Label
        {
            Text      = "",
            Bounds    = new Rectangle(60, 278, W - 120, 80),
            ForeColor = C_Muted,
            Font      = new Font("Segoe UI", 9.5f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.TopCenter,
            AutoSize  = false,
        };
        panel.Controls.Add(_lblDoneSub);

        var btnClose = new DlvButton("Close Window", DlvButtonStyle.Primary)
        {
            Bounds = new Rectangle(W / 2 - 96, 374, 192, 46),
        };
        btnClose.Click += (_, _) => Application.Exit();
        panel.Controls.Add(btnClose);

        panel.Controls.Add(new Label
        {
            Text      = "v4  ·  detectable.cc",
            Bounds    = new Rectangle(0, PH - 30, W, 20),
            ForeColor = C_Dim,
            Font      = new Font("Segoe UI", 8f),
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleCenter,
            AutoSize  = false,
        });

        return panel;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════
    Panel DarkPanel() => new Panel { BackColor = C_Bg, ForeColor = C_Text };

    Label SmallLabel(string text, int x, int y, int w) => new Label
    {
        Text      = text,
        Bounds    = new Rectangle(x, y, w, 16),
        ForeColor = C_Muted,
        Font      = new Font("Segoe UI", 8f, FontStyle.Bold),
        BackColor = Color.Transparent,
        AutoSize  = false,
    };

    static void CenterString(Graphics g, string text, Font font, Brush brush, int y, int width)
    {
        var sz = g.MeasureString(text, font);
        g.DrawString(text, font, brush, (width - sz.Width) / 2f, y);
    }

    void ShowPanel(Panel target)
    {
        foreach (var p in new[] { _pnlToken, _pnlConsent, _pnlScan, _pnlDone })
            p.Visible = p == target;
    }

    void SafeInvoke(Action action)
    {
        if (InvokeRequired) Invoke(action);
        else action();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Custom controls
// ═══════════════════════════════════════════════════════════════════════

enum DlvButtonStyle { Primary, Ghost, Success }

class DlvButton : Control
{
    static readonly Color C_Accent  = Color.FromArgb(41,  151, 255);
    static readonly Color C_Accent2 = Color.FromArgb(20,  112, 210);
    static readonly Color C_Bg4     = Color.FromArgb(24,  34,  56);
    static readonly Color C_Border2 = Color.FromArgb(36,  52,  86);
    static readonly Color C_Green   = Color.FromArgb(46,  204, 113);
    static readonly Color C_Green2  = Color.FromArgb(36,  174, 96);
    static readonly Color C_Text    = Color.FromArgb(220, 232, 252);
    static readonly Color C_Muted   = Color.FromArgb(98,  120, 162);

    readonly DlvButtonStyle _style;
    bool _hover, _pressed;

    public DlvButton(string text, DlvButtonStyle style = DlvButtonStyle.Primary)
    {
        _style  = style;
        Text    = text;
        Cursor  = Cursors.Hand;
        Font    = new Font("Segoe UI Semibold", 9.5f);
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover   = true;  Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover   = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { _pressed = true;  Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e)   { _pressed = false; Invalidate(); base.OnMouseUp(e); }

    protected override void OnClick(EventArgs e)
    {
        if (!Enabled) return;
        base.OnClick(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g  = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var rc = new Rectangle(0, 0, Width, Height);

        Color bg = _style switch
        {
            DlvButtonStyle.Primary when _pressed => C_Accent2,
            DlvButtonStyle.Primary when _hover   => Color.FromArgb(60, 165, 255),
            DlvButtonStyle.Primary               => C_Accent,
            DlvButtonStyle.Success when _pressed => C_Green2,
            DlvButtonStyle.Success when _hover   => Color.FromArgb(56, 214, 123),
            DlvButtonStyle.Success               => C_Green,
            _ /* Ghost */ when _hover            => C_Bg4,
            _                                    => Color.Transparent,
        };

        using var path = RoundedRect(rc, 7);

        if (!Enabled)
        {
            using var bgBr = new SolidBrush(Color.FromArgb(80, bg));
            g.FillPath(bgBr, path);
        }
        else
        {
            using var bgBr = new SolidBrush(bg);
            g.FillPath(bgBr, path);
        }

        if (_style == DlvButtonStyle.Ghost)
        {
            using var pen = new Pen(C_Border2, 1);
            g.DrawPath(pen, path);
        }

        Color fg = Enabled
            ? (_style == DlvButtonStyle.Ghost ? (_hover ? C_Text : C_Muted) : Color.White)
            : Color.FromArgb(100, C_Text);

        using var br  = new SolidBrush(fg);
        var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString(Text, Font, br, rc, fmt);
    }

    static GraphicsPath RoundedRect(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, radius * 2, radius * 2, 180, 90);
        path.AddArc(r.Right - radius * 2, r.Y, radius * 2, radius * 2, 270, 90);
        path.AddArc(r.Right - radius * 2, r.Bottom - radius * 2, radius * 2, radius * 2, 0, 90);
        path.AddArc(r.X, r.Bottom - radius * 2, radius * 2, radius * 2, 90, 90);
        path.CloseFigure();
        return path;
    }
}

class DlvProgressBar : Control
{
    static readonly Color C_Bg4     = Color.FromArgb(24,  34,  56);
    static readonly Color C_Accent  = Color.FromArgb(41, 151, 255);
    static readonly Color C_AccentL = Color.FromArgb(80, 180, 255);

    int _value;
    public int Value
    {
        get => _value;
        set { _value = Math.Clamp(value, 0, 100); Invalidate(); }
    }

    public DlvProgressBar()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var trackPath = RoundedRect(new Rectangle(0, 0, Width, Height), Height / 2);
        using (var b = new SolidBrush(C_Bg4))
            g.FillPath(b, trackPath);

        int fillW = (int)(Width * (_value / 100.0));
        if (fillW > 0)
        {
            var fillRect = new Rectangle(0, 0, fillW, Height);
            using var fillPath = RoundedRect(fillRect, Height / 2);
            using var br = new LinearGradientBrush(
                new Point(0, 0), new Point(fillW, 0),
                C_AccentL, C_Accent);
            g.FillPath(br, fillPath);
            using var sheenBr = new SolidBrush(Color.FromArgb(60, 255, 255, 255));
            g.FillRectangle(sheenBr, 2, 1, Math.Max(0, fillW - 4), 2);
        }
    }

    static GraphicsPath RoundedRect(Rectangle r, int radius)
    {
        if (r.Width < radius * 2) radius = Math.Max(1, r.Width / 2);
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, radius * 2, radius * 2, 180, 90);
        path.AddArc(r.Right - radius * 2, r.Y, radius * 2, radius * 2, 270, 90);
        path.AddArc(r.Right - radius * 2, r.Bottom - radius * 2, radius * 2, radius * 2, 0, 90);
        path.AddArc(r.X, r.Bottom - radius * 2, radius * 2, radius * 2, 90, 90);
        path.CloseFigure();
        return path;
    }
}

class DlvRiskBar : Control
{
    static readonly Color C_Bg3    = Color.FromArgb(18, 26, 44);
    static readonly Color C_Border = Color.FromArgb(28, 40, 68);
    static readonly Color C_Muted  = Color.FromArgb(98, 120, 162);

    public int    RiskScore { get; set; }
    public string RiskLevel { get; set; } = "";

    public DlvRiskBar()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        var level = RiskLevel.ToUpperInvariant();
        Color riskColor = level switch
        {
            "CRITICAL" => Color.FromArgb(180, 40,  30),
            "HIGH"     => Color.FromArgb(231, 76,  60),
            "MEDIUM"   => Color.FromArgb(243, 156, 18),
            "LOW"      => Color.FromArgb(41, 151, 255),
            _          => Color.FromArgb(46,  204, 113),
        };

        using var cardPath = RoundedRect(new Rectangle(0, 0, Width, Height), 6);
        using (var b = new SolidBrush(C_Bg3))
            g.FillPath(b, cardPath);
        using (var p = new Pen(C_Border, 1))
            g.DrawPath(p, cardPath);

        using var fLabel = new Font("Segoe UI Semibold", 8f);
        using var bMuted = new SolidBrush(C_Muted);
        g.DrawString("RISK LEVEL", fLabel, bMuted, 10, 8);

        using var fLevel = new Font("Segoe UI Semibold", 9f);
        using var bLevel = new SolidBrush(riskColor);
        string scoreStr = $"{level}  ({RiskScore}/100)";
        var szLevel = g.MeasureString(scoreStr, fLevel);
        g.DrawString(scoreStr, fLevel, bLevel, Width - szLevel.Width - 10, 8);

        int barY = 28, barH = 10;
        int trackX = 10, trackW = Width - 20;
        using var trackPath = RoundedRect(new Rectangle(trackX, barY, trackW, barH), barH / 2);
        using (var b = new SolidBrush(Color.FromArgb(20, 40, 60)))
            g.FillPath(b, trackPath);

        int fillW = (int)(trackW * (RiskScore / 100.0));
        if (fillW > 0)
        {
            using var fillPath = RoundedRect(new Rectangle(trackX, barY, fillW, barH), barH / 2);
            using var fillBr = new LinearGradientBrush(
                new Point(trackX, barY), new Point(trackX + fillW, barY),
                Color.FromArgb(46, 204, 113), riskColor);
            g.FillPath(fillBr, fillPath);
        }
    }

    static GraphicsPath RoundedRect(Rectangle r, int radius)
    {
        if (r.Width < radius * 2) radius = Math.Max(1, r.Width / 2);
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, radius * 2, radius * 2, 180, 90);
        path.AddArc(r.Right - radius * 2, r.Y, radius * 2, radius * 2, 270, 90);
        path.AddArc(r.Right - radius * 2, r.Bottom - radius * 2, radius * 2, radius * 2, 0, 90);
        path.AddArc(r.X, r.Bottom - radius * 2, radius * 2, radius * 2, 90, 90);
        path.CloseFigure();
        return path;
    }
}

