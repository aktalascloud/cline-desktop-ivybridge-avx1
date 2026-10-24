use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use std::{env, fs};
fn main() {
    let a: Vec<String> = env::args().collect();
    assert_eq!(a.len(), 4, "installer, public key and updater signature paths required");
    let mut data = fs::read(&a[1]).unwrap();
    let decode = |path: &str| String::from_utf8(base64::engine::general_purpose::STANDARD.decode(fs::read_to_string(path).unwrap().trim()).unwrap()).unwrap();
    let key = PublicKey::decode(&decode(&a[2])).unwrap();
    let sig = Signature::decode(&decode(&a[3])).unwrap();
    key.verify(&data, &sig, true).unwrap();
    let last = data.len()-1; data[last] ^= 1;
    assert!(key.verify(&data,&sig,true).is_err(),"tampered installer must fail verification");
    println!("{{\"signature_valid\":true,\"tamper_rejected\":true,\"engine\":\"minisign-verify 0.2.5, same verification as Tauri updater\"}}");
}
