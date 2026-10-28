!include "Win\RestartManager.nsh"
!ifndef AVX1_AUTOSTART_LINK
!define AVX1_AUTOSTART_LINK "Cline Desktop AVX1 RU.lnk"
!endif

; Existing installations use Tauri's normal in-place updater path. This
; bypasses older uninstallers that only reject a hidden Hub instead of
; closing it. The preinstall hook below then owns shutdown before writes.
!macro AVX1_DETECT_EXISTING_INSTALLATION
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $UpdateMode 1
  ${EndIf}
!macroend

; The bundled cline-cli.exe runs the desktop backend and, as a detached
; daemon, the Hub, which outlives the desktop. Stop users of every installed
; executable before replacing any: stopping only the CLI first leaves the
; desktop able to spawn it again. code-sidecar.exe is the backend and Hub
; executable of earlier releases; its Hub may still be running on upgrade.
;
; Restart Manager identifies users of the exact files across architectures.
; Do not use Get-Process.Path: NSIS is x86 even for an x64 bundle, and x86
; PowerShell returns an empty Path for x64 processes. Do not kill by image
; name either: another installation (e.g. Beta) must remain untouched.
!macro StopDesktopProcesses
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  StrCpy $5 0

  retry:
    System::Call 'rstrtmgr::RmStartSession(*i .r1, i 0, w .r2) i .r0'
    ${If} $0 != 0
      Goto failed ; no session to end
    ${EndIf}

    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}

    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\cline-cli.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}

    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\code-sidecar.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}

    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\bin\dsw2api\runtime\python.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}
    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\bin\dsw2api\runtime\pythonw.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}
    !insertmacro RestartManager_RegisterFile $1 "$INSTDIR\bin\dsw2api\cline-dsw2api-pow.exe"
    ${If} $0 != 0
      Goto end_session
    ${EndIf}

    StrCpy $3 0
    System::Call 'rstrtmgr::RmGetList(i r1, *i .r2, *i r3, p 0, *i .r4) i .r0'
    ${If} $0 == 234 ; ERROR_MORE_DATA: at least one process uses these files
      ; A hidden backend/Hub can outlive the window. 234 is a size-query
      ; result, not a shutdown failure. Ask Windows to close owners of these
      ; exact files; force only nonresponsive owners after its grace period.
      ; Never kill by image name: another installation must keep running.
      ${If} $LANGUAGE == ${LANG_RUSSIAN}
        DetailPrint "Закрытие Cline Desktop AVX1 RU и фоновых компонентов..."
      ${Else}
        DetailPrint "Closing Cline Desktop AVX1 RU and its background components..."
      ${EndIf}
      System::Call 'rstrtmgr::RmShutdown(i r1, i 1, p 0) i .r0'
      ${If} $0 == 0
      ${OrIf} $0 == 351 ; some owners may still be releasing their images
        StrCpy $3 0
        System::Call 'rstrtmgr::RmGetList(i r1, *i .r2, *i r3, p 0, *i .r4) i .r0'
      ${EndIf}
    ${EndIf}
    ; A 0 from RmGetList means nothing holds the files: $0 stays 0.

  end_session:
    ; Release the session on every path, preserving the operation's error.
    System::Call 'rstrtmgr::RmEndSession(i r1)'
    ${If} $0 == 234
    ${AndIf} $5 < 10
      ; Allow the updater's already-exiting process to release its image.
      IntOp $5 $5 + 1
      Sleep 200
      Goto retry
    ${EndIf}
    ${If} $0 == 0
      Goto done
    ${EndIf}

  failed:
    DetailPrint "Could not stop Cline processes in $INSTDIR (Restart Manager error $0)."
    ; Tauri's updater runs the installer passive (/P): the user who clicked
    ; "Restart now" is watching, and NSIS's own write-failure dialog would
    ; have shown in that mode anyway, so offer a retry. Silent (/S) takes
    ; the default and fails closed. Aborting rather than continuing keeps
    ; the install from ending half-replaced.
    ${If} $LANGUAGE == ${LANG_RUSSIAN}
      MessageBox MB_RETRYCANCEL|MB_ICONSTOP "Не удалось автоматически закрыть компоненты приложения:$\r$\n$INSTDIR$\r$\n$\r$\nЗакройте оставшиеся процессы Cline Desktop AVX1 RU и нажмите «Повтор». Код Windows: $0." /SD IDCANCEL IDRETRY retry
    ${Else}
      MessageBox MB_RETRYCANCEL|MB_ICONSTOP "Could not automatically close application components:$\r$\n$INSTDIR$\r$\n$\r$\nClose the remaining Cline Desktop AVX1 RU processes and click Retry. Windows code: $0." /SD IDCANCEL IDRETRY retry
    ${EndIf}
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    SetErrorLevel 2
    Abort

  done:
    ; Nothing installs the earlier backend executable any more.
    Delete "$INSTDIR\code-sidecar.exe"
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CallArtificialFunction StopDesktopProcesses
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CallArtificialFunction StopDesktopProcesses
  Delete "$SMSTARTUP\${AVX1_AUTOSTART_LINK}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  CreateShortCut "$SMSTARTUP\${AVX1_AUTOSTART_LINK}" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
