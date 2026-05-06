// If shard 3 contained ONLY the parity harness (122.5s file), what's the wall?
// wall = 0.305 * 122500 + 11600 = 48,963ms = 49s
//
// So the 122.5s file, alone on a shard with 4-CPU parallelism, is 49s wall.
// The reason it "looked like 160s" is because it shares the shard with 290s of other files.

const A = 0.305, B = 11600;
console.log('Parity file alone (sum=122500ms):', (A * 122500 + B).toFixed(0), 'ms wall');
console.log('Weights-1 alone (sum=84365ms):', (A * 84365 + B).toFixed(0), 'ms wall');
console.log('Parity + 220s of filler (sum=342500ms):', (A * 342500 + B).toFixed(0), 'ms wall');

// LPT-packed shards all sit at ~220s sum → ~79s wall regardless of heaviest file
console.log('LPT balanced shard (sum=220500ms):', (A * 220500 + B).toFixed(0), 'ms wall');

// The heaviest file within a file is the critical-path — BUT node:test within a file
// also runs concurrently. Let me look at what's inside parity to see if it's single-threaded.
