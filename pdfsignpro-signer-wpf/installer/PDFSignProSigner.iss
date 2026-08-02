; PDFSignPro Signer - Inno Setup script (WPF + Core)
; Per-user install (no admin) → %LOCALAPPDATA%\PDFSignProSigner
; Registers pdfsignpro:// URL protocol for current user (HKCU)

#define MyAppName "PDFSignPro Signer"
#define MyAppVersion "1.0.4"
#define MyAppExe "PDFSignProSigner.exe"

[Setup]
; New AppId so per-user install does not fight old machine-wide Program Files installs
AppId={{B2C3D4E5-F6A7-8901-BCDE-F12345678901}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=pdfsign.vn
AppPublisherURL=https://pdfsign.vn
AppSupportURL=https://pdfsign.vn/signer
DefaultDirName={localappdata}\PDFSignProSigner
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist-installer
OutputBaseFilename=PDFSignProSignerSetup
Compression=lzma2
SolidCompression=yes
; No admin / UAC — works on locked-down office PCs
PrivilegesRequired=lowest
; Optional: advanced users can still elevate via override dialog
PrivilegesRequiredOverridesAllowed=dialog
WizardStyle=modern
; Close running Signer before overwrite
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
UninstallDisplayIcon={app}\{#MyAppExe}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=pdfsign.vn
VersionInfoDescription=PDFSignPro Signer Setup
VersionInfoProductName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "Start Signer with Windows (recommended)"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; WPF app + PDFSignProSignerCore.exe (both in publish/)
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
; Fonts (optional)
Source: "..\..\desktop-signer\assets\fonts\*"; DestDir: "{app}\assets\fonts"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist

[Registry]
; Register pdfsignpro:// URL protocol (per-user HKCU). Uninstall removes key tree.
Root: HKCU; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueData: "URL:PDFSignPro Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\pdfsignpro"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\pdfsignpro\DefaultIcon"; ValueType: string; ValueData: """{app}\{#MyAppExe}"",0"
Root: HKCU; Subkey: "Software\Classes\pdfsignpro\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExe}"" ""%1"""
; Optional autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PDFSignProSigner"; ValueData: """{app}\{#MyAppExe}"" --minimized"; Flags: uninsdeletevalue; Tasks: autostart
; Marker for web readiness / support
Root: HKCU; Subkey: "Software\PDFSignPro\Signer"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\PDFSignPro\Signer"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"
Root: HKCU; Subkey: "Software\PDFSignPro\Signer"; ValueType: string; ValueName: "InstallMode"; ValueData: "per-user"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  // Tip when an older machine-wide install may still own pdfsignpro:// via HKLM
  if RegKeyExists(HKEY_LOCAL_MACHINE, 'Software\Classes\pdfsignpro') then
  begin
    MsgBox(
      'Phát hiện bản Signer cũ (cài Program Files / admin).' + #13#10 + #13#10 +
      'Khuyến nghị: gỡ bản cũ trong Settings → Apps, rồi cài bản per-user này.' + #13#10 +
      'Nếu không gỡ, deep link pdfsignpro:// có thể vẫn trỏ tới bản cũ.',
      mbInformation, MB_OK);
  end;
end;
