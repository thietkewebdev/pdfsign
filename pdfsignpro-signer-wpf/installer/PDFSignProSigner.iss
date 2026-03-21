; PDFSignPro Signer - Inno Setup script (WPF + Core)
; Machine-wide install to Program Files (requires admin / UAC)
; Registers pdfsignpro:// URL protocol for all users (HKLM)

#define MyAppName "PDFSignPro Signer"
#define MyAppVersion "1.0.0"
#define MyAppExe "PDFSignProSigner.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
; 64-bit app -> install under 64-bit Program Files (Inno 6.2: avoid x64compatible; use InstallIn64BitMode only)
ArchitecturesInstallIn64BitMode=x64
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist-installer
OutputBaseFilename=PDFSignProSignerSetup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; WPF app + PDFSignProSignerCore.exe (both in publish/)
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
; Fonts (optional)
Source: "..\..\desktop-signer\assets\fonts\*"; DestDir: "{app}\assets\fonts"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist

[Registry]
; Register pdfsignpro:// URL protocol (machine-wide)
Root: HKLM; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueData: "URL:PDFSignPro Protocol"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKLM; Subkey: "Software\Classes\pdfsignpro\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExe}"" ""%1"""

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
