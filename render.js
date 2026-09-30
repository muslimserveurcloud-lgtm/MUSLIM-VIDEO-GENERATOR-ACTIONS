const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const dir = process.argv[2], o = JSON.parse(fs.readFileSync(path.join(dir, 'options.json'), 'utf8'));
const run = (cmd, args) => new Promise((ok, ko) => {
  const p = spawn(cmd, args); let e = '';
  p.stderr.on('data', d => e = (e + d).slice(-600));
  p.on('error', ko); p.on('close', c => c ? ko(new Error(e)) : ok());
});
const ts = s => {
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(3).replace('.', ',');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.padStart(6, '0')}`;
};
(async () => {
  const secs = Math.min(45, Math.max(1, +o.minutes || 1)) * 60, per = 8, fps = 15, fr = per * fps;
  const idir = path.join(dir, 'images');
  const imgs = fs.existsSync(idir) ? fs.readdirSync(idir).sort().map(f => path.resolve(idir, f)) : [];
  const n = Math.max(imgs.length, 1), clips = [];
  for (let i = 0; i < n; i++) {
    const c = path.resolve(dir, `c${i}.mp4`);
    const z = i % 2 ? `z='1.25-0.25*on/${fr}'` : `z='1+0.25*on/${fr}'`;
    const src = imgs[i] ? ['-i', imgs[i]] : ['-f', 'lavfi', '-i', `color=c=0x0b3d2e:s=1280x720:r=${fps}`];
    const vf = imgs[i]
      ? `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=${z}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${fr}:s=1280x720:fps=${fps},format=yuv420p`
      : 'format=yuv420p';
    await run('ffmpeg', ['-y', ...src, '-vf', vf, '-t', per, '-r', fps, '-c:v', 'libx264', '-preset', 'ultrafast', c]);
    clips.push(c);
  }
  const list = path.join(dir, 'list.txt'), cycles = Math.ceil(secs / (per * clips.length));
  fs.writeFileSync(list, Array(cycles).fill(clips.map(c => `file '${c}'`).join('\n')).join('\n'));

  let audio = fs.readdirSync(dir).find(f => f.startsWith('audio.'));
  audio = audio && path.resolve(dir, audio);
  if (!audio && (o.voice || '').trim()) {
    audio = path.resolve(dir, 'voice.wav');
    fs.writeFileSync(path.join(dir, 'voice.txt'), o.voice);
    await run('espeak-ng', ['-v', o.lang || 'fr', '-f', path.join(dir, 'voice.txt'), '-w', audio]);
  }
  const ain = audio ? ['-stream_loop', '-1', '-i', audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];

  const lines = (o.captions || '').split('\n').map(s => s.trim()).filter(Boolean);
  const srt = path.join(dir, 's.srt'), slot = secs / (lines.length || 1);
  fs.writeFileSync(srt, lines.map((t, i) => `${i + 1}\n${ts(i * slot)} --> ${ts((i + 1) * slot - 0.2)}\n${t}\n`).join('\n'));
  const soft = lines.length && !o.burn, burn = lines.length && o.burn;

  const a = ['-y', '-f', 'concat', '-safe', '0', '-i', list, ...ain];
  if (soft) a.push('-i', srt);
  a.push('-map', '0:v', '-map', '1:a');
  if (soft) a.push('-map', '2:0');
  a.push(...(burn ? ['-vf', `subtitles=${srt}`, '-c:v', 'libx264', '-preset', 'ultrafast'] : ['-c:v', 'copy']));
  a.push('-c:a', 'aac', '-b:a', '128k');
  if (soft) a.push('-c:s', 'mov_text');
  a.push('-t', secs, '-movflags', '+faststart', path.join(dir, 'video.mp4'));
  await run('ffmpeg', a);
})().catch(e => { console.error(e.message); process.exit(1); });
