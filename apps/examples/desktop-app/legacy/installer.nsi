Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 16

!include MUI2.nsh
!include LogicLib.nsh
!include WinVer.nsh
!include x64.nsh
!include "Win\RestartManager.nsh"

!define PRODUCT "Cline Desktop Legacy"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClineDesktopLegacy"
Name "${PRODUCT}"
OutFile "${CLINE_INSTALLER}"
InstallDir "$LOCALAPPDATA\Programs\Cline Desktop Legacy"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" InstallLocation
VIProductVersion "0.0.51.0"
VIAddVersionKey "FileDescription" "Cline Desktop Legacy Setup"
VIAddVersionKey "ProductName" "${PRODUCT}"
VIAddVersionKey "FileVersion" "0.0.51"
VIAddVersionKey "LegalCopyright" "Cline contributors"
!define MUI_ICON "${CLINE_STAGE}\resources\app\icon.ico"
!define MUI_UNICON "${CLINE_STAGE}\resources\app\icon.ico"

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Russian"

Function .onInit
  ${IfNot} ${RunningX64}
  ${OrIfNot} ${AtLeastWin7}
    MessageBox MB_OK|MB_ICONSTOP "Cline Desktop Legacy requires 64-bit Windows 7 SP1 or later." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  ${If} ${IsWin7}
  ${AndIfNot} ${AtLeastServicePack} 1
    MessageBox MB_OK|MB_ICONSTOP "Install Service Pack 1 for Windows 7 before running Cline Desktop Legacy." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
FunctionEnd

!macro ReleaseExecutable PREFIX
Function ${PREFIX}ReleaseExecutable
  IfFileExists "$INSTDIR\ClineLegacy.exe" 0 done
  System::Call 'rstrtmgr::RmStartSession(*i .r1, i 0, w .r2) i .r0'
  ${If} $0 != 0
    Goto failed
  ${EndIf}
  !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\ClineLegacy.exe"
  ${If} $0 == 0
    StrCpy $3 0
    System::Call 'rstrtmgr::RmGetList(i r1, *i .r2, *i r3, p 0, *i .r4) i .r0'
    ${If} $0 == 234
      System::Call 'rstrtmgr::RmShutdown(i r1, i ${RmForceShutdown}, p 0) i .r0'
    ${EndIf}
  ${EndIf}
  System::Call 'rstrtmgr::RmEndSession(i r1)'
  ${If} $0 == 0
    Goto done
  ${EndIf}
  failed:
    MessageBox MB_OK|MB_ICONSTOP "Close Cline Desktop Legacy and its background processes, then retry." /SD IDOK
    SetErrorLevel 2
    Abort
  done:
FunctionEnd
!macroend

!insertmacro ReleaseExecutable ""
!insertmacro ReleaseExecutable "un."

Section "Install"
  Call ReleaseExecutable
  SetOutPath "$INSTDIR"
  File /r "${CLINE_STAGE}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" DisplayName "${PRODUCT}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" DisplayVersion "0.0.51"
  WriteRegStr HKCU "${UNINSTALL_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" DisplayIcon "$INSTDIR\ClineLegacy.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" UninstallString '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" NoModify 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" NoRepair 1
  CreateShortCut "$SMPROGRAMS\Cline Desktop Legacy.lnk" "$INSTDIR\ClineLegacy.exe" "" "$INSTDIR\resources\app\icon.ico"
SectionEnd

Section "Uninstall"
  Call un.ReleaseExecutable
  !include "${CLINE_UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$SMPROGRAMS\Cline Desktop Legacy.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  RMDir "$INSTDIR"
SectionEnd
