// SPDX-License-Identifier: Apache-2.0
// Independent scalar implementation of the SHA-3 sponge/Keccak-p algorithm
// (FIPS 202), with round zero omitted as required by DeepSeekHashV1.
// No source from the AGPL ds2api implementation is incorporated here.
use std::{env, process, time::Instant};

const ROUND_CONSTANTS: [u64; 24] = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
    0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];
const ROTATION: [[u32; 5]; 5] = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
];

fn permutation(state: &mut [u64; 25]) {
    for constant in &ROUND_CONSTANTS[1..] {
        let mut columns = [0; 5];
        for (x, column) in columns.iter_mut().enumerate() {
            for y in 0..5 { *column ^= state[x + 5 * y]; }
        }
        let mut moved = [0; 25];
        for y in 0..5 {
            for x in 0..5 {
                let delta = columns[(x + 4) % 5] ^ columns[(x + 1) % 5].rotate_left(1);
                let lane = state[x + 5 * y] ^ delta;
                moved[y + 5 * ((2 * x + 3 * y) % 5)] = lane.rotate_left(ROTATION[x][y]);
            }
        }
        for y in 0..5 {
            for x in 0..5 {
                state[x + 5 * y] = moved[x + 5 * y]
                    ^ ((!moved[(x + 1) % 5 + 5 * y]) & moved[(x + 2) % 5 + 5 * y]);
            }
        }
        state[0] ^= constant;
    }
}

fn absorb(state: &mut [u64; 25], block: &[u8]) {
    for (index, bytes) in block.chunks_exact(8).enumerate() {
        state[index] ^= u64::from_le_bytes(bytes.try_into().unwrap());
    }
    permutation(state);
}

fn digest(input: &[u8]) -> [u8; 32] {
    const RATE: usize = 136;
    let mut state = [0; 25];
    let mut blocks = input.chunks_exact(RATE);
    for block in &mut blocks { absorb(&mut state, block); }
    let tail = blocks.remainder();
    let mut padded = [0; RATE];
    padded[..tail.len()].copy_from_slice(tail);
    padded[tail.len()] = 0x06;
    padded[RATE - 1] |= 0x80;
    absorb(&mut state, &padded);
    let mut output = [0; 32];
    for (index, lane) in state[..4].iter().enumerate() {
        output[8 * index..8 * index + 8].copy_from_slice(&lane.to_le_bytes());
    }
    output
}

fn parse_digest(value: &str) -> Result<[u8; 32], ()> {
    if value.len() != 64 || !value.is_ascii() { return Err(()); }
    let mut output = [0; 32];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).map_err(|_| ())?;
    }
    Ok(output)
}

fn append_decimal(buffer: &mut Vec<u8>, mut value: u64) {
    let mut digits = [0; 20];
    let mut start = digits.len();
    loop {
        start -= 1; digits[start] = b'0' + (value % 10) as u8; value /= 10;
        if value == 0 { break; }
    }
    buffer.extend_from_slice(&digits[start..]);
}

fn solve(expected: [u8; 32], salt: &str, expires: u64, difficulty: u64) -> Option<u64> {
    let mut message = format!("{salt}_{expires}_").into_bytes();
    let prefix = message.len();
    message.reserve(20);
    for nonce in 0..difficulty {
        message.truncate(prefix); append_decimal(&mut message, nonce);
        if digest(&message) == expected { return Some(nonce); }
    }
    None
}

fn main() {
    let arguments: Vec<String> = env::args().skip(1).collect();
    if arguments.first().map(String::as_str) == Some("hash") && arguments.len() == 2 {
        for byte in digest(arguments[1].as_bytes()) { print!("{byte:02x}"); }
        println!(); return;
    }
    if arguments.first().map(String::as_str) == Some("bench") && arguments.len() == 2 {
        let count: u64 = arguments[1].parse().unwrap_or(0);
        if !(1..=10_000_000).contains(&count) { process::exit(2); }
        let start = Instant::now();
        let result = solve([0xff; 32], "anonymous-benchmark", 1_800_000_000_000, count);
        println!("{{\"hashes\":{count},\"elapsed_ns\":{},\"found\":{}}}", start.elapsed().as_nanos(), result.is_some());
        return;
    }
    if arguments.len() != 5 || arguments[0] != "solve" || arguments[2].len() > 1024 {
        eprintln!("Invalid PoW input"); process::exit(2);
    }
    let result = parse_digest(&arguments[1]).and_then(|challenge| {
        let expires: u64 = arguments[3].parse().map_err(|_| ())?;
        let difficulty: u64 = arguments[4].parse().map_err(|_| ())?;
        if difficulty == 0 || difficulty > 100_000_000 { return Err(()); }
        solve(challenge, &arguments[2], expires, difficulty).ok_or(())
    });
    match result { Ok(nonce) => println!("{nonce}"), Err(()) => { eprintln!("PoW solution unavailable"); process::exit(1); } }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn verifies_search_and_bounds() {
        let expected = digest(b"fixture_123_1000");
        assert_eq!(solve(expected, "fixture", 123, 1001), Some(1000));
        assert_eq!(solve(expected, "fixture", 123, 1000), None);
    }
    #[test]
    fn rejects_bad_hex() { assert!(parse_digest("a").is_err()); assert!(parse_digest(&"z".repeat(64)).is_err()); }
}
