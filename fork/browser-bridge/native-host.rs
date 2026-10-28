// SPDX-License-Identifier: Apache-2.0
use std::{env,path::PathBuf,process::{Command,Stdio}};
fn normal(path:PathBuf)->PathBuf{let text=path.to_string_lossy();if let Some(value)=text.strip_prefix(r"\\?\"){if value.as_bytes().get(1)==Some(&b':'){return PathBuf::from(value);}}path}
fn main(){
 let origin="chrome-extension://jaljomgoclehkemckjhifflhmlllfopc/";
 if env::args().nth(1).as_deref()!=Some(origin){std::process::exit(1);}
 let exe=normal(env::current_exe().unwrap());let directory=exe.parent().unwrap();let root=directory.parent().unwrap().parent().unwrap();
 let installed=root.join("cline-cli.exe");let development=directory.parent().unwrap().join("cline-cli-x86_64-pc-windows-msvc.exe");
 let cli=if installed.is_file(){installed}else{development};if !cli.is_file(){std::process::exit(1);}
 let mut command=Command::new(cli);
 command.arg("run").arg("--no-env-file").arg(directory.join("native-host.mjs")).env("BUN_BE_BUN","1").env("CLINE_NO_AUTO_UPDATE","1").stdin(Stdio::inherit()).stdout(Stdio::inherit()).stderr(Stdio::null());
 #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
 match command.status(){Ok(status)=>std::process::exit(status.code().unwrap_or(1)),Err(_)=>std::process::exit(1)}
}
