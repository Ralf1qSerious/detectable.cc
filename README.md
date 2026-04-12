# detectable.cc — FiveM PC Checker Platform

A full-stack PC checker platform for FiveM communities — similar to detect.ac — consisting of:

- **Web dashboard** (Node.js + Socket.io) — checkers log in, manage sessions, and view scan results in real-time
- **Client scanner** (.exe, C# .NET 8) — runs on the player's machine, scans for known FiveM cheats, and uploads results

---

## Project Structure

```
SnipTool/
├── backend/          Node.js API + Socket.io server
│   ├── server.js
│   └── package.json
├── frontend/         Static web dashboard (served by the backend)
│   ├── index.html    Login page
│   ├── dashboard.html
│   ├── session.html
│   └── assets/
│       ├── style.css
│       ├── dashboard.js
│       └── session.js
└── client/
    └── DetectableLV/ C# .NET 8 scanner application
        ├── Program.cs
        ├── Scanner.cs
        ├── ApiClient.cs
        ├── Models/ScanResult.cs
        └── DetectableLV.csproj
```

---

## Quick Start

### 1. Start the backend

```bash
cd backend
npm install
npm start
```

Server runs at **http://localhost:3000**

Default login: `admin` / `admin123`  ← **change this in production**

### 2. Open the dashboard

Navigate to `http://localhost:3000` in your browser and log in.

### 3. Build the client .exe

Requirements: [.NET 8 SDK](https://dotnet.microsoft.com/download)

```bash
cd client/DetectableLV
dotnet publish -c Release -r win-x64 --self-contained
```

The compiled `.exe` is in `bin/Release/net8.0-windows/win-x64/publish/DetectableLV.exe`

> ⚠️ Before building, update the `DefaultServerUrl` in `Program.cs` to match your server's public address.

---

## How It Works

### Checker workflow

1. Log into the dashboard
2. Click **New Session** → enter the player's name/Discord
3. Copy the **Session Token** and send it to the player
4. Ask the player to run `DetectableLV.exe` and enter the token
5. Watch the dashboard — results appear in real-time as soon as the scan finishes

### Player workflow

1. Receive `DetectableLV.exe` from a trusted server staff member
2. Run it **as Administrator** (required to read full process info)
3. Read the consent screen — it clearly lists what data is collected
4. Type `yes` to consent and enter the session token when prompted
5. Wait for the scan to complete — the window tells you when to close

---

## What Gets Scanned

| Category | Details |
|---|---|
| System Info | Username, computer name, OS, CPU, RAM, GPU, HWID, IP, MAC |
| Processes | All running processes checked against known cheat names |
| File System | Known cheat directories (Eulen, Stand, Kiddion's, YimMenu, Cherax, etc.) |
| Quick Scan | Desktop / Documents / Downloads scanned for suspicious `.exe`/`.dll` |
| Registry | Startup run keys checked for cheat-related entries |
| Software | Installed software list |
| Screenshot | Primary monitor screenshot at time of scan |

### Detected cheats (examples)

- Kiddion's Modest Menu
- Eulen
- Stand
- YimMenu
- Lumia
- Cherax / Phantom-X
- Orbital, Paragon, Zyros
- Common injectors (Extreme Injector, Xenos, WinJect)
- Debugging tools (Cheat Engine, x64dbg, Process Hacker, dnSpy)
- HWID spoofers

---

## Configuration

### Change the admin password

Edit `backend/server.js` — search for `admin123` and replace with a secure password.  
For production, store credentials in a database (MongoDB / PostgreSQL) and load the admin password from an environment variable.

### Point the client to your server

In `client/DetectableLV/Program.cs`, change `DefaultServerUrl`:

```csharp
const string DefaultServerUrl = "https://detectable.cc";
```

Or pass the URL as the first command-line argument:

```
DetectableLV.exe https://detectable.cc <SESSION_TOKEN>
```

### Deploy the backend

Any Node.js host works (VPS, Railway, Render, etc.).  
Set the `PORT` and `JWT_SECRET` environment variables:

```
PORT=3000
JWT_SECRET=your-very-long-random-secret
```

Use **HTTPS** in production to protect session tokens in transit.

---

## Security Notes

- The session token acts as a one-time password for the submit endpoint — keep it confidential and treat each session as single-use
- The `JWT_SECRET` must be changed from the default before going to production
- The client clearly shows a consent screen before scanning — never distribute the scanner without player consent
- For production, add rate limiting (`express-rate-limit`) and store data in a persistent database

---

## Adding More Checkers

Once logged in, use the API to register a new checker account:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"username":"newchecker","password":"securepassword"}'
```
