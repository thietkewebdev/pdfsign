; PDFSignPro Signer - Inno Setup script (WPF + Core)
; Per-user install to {localappdata}\PDFSignProSigner
; Registers pdfsignpro:// URL protocol

#define MyAppName "PDFSignPro Signer"
#define MyAppVersion "1.0.0"
#define MyAppExe "PDFSignProSigner.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\PDFSignProSigner
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist-installer
OutputBaseFilename=PDFSignProSignerSetup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
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
; Register pdfsignpro:// URL protocol (HKCU = per-user)
Root: HKCU; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueData: "URL:PDFSignPro Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\pdfsignpro\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExe}"" ""%1"""

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
