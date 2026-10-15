"""One-time sound and particle authoring, using the staged asset tools."""
import json,subprocess
from pathlib import Path
R=Path(__file__).resolve().parent.parent
T=Path('/tmp/deepcore-effects');T.mkdir(exist_ok=True)
(R/'assets/fx').mkdir(parents=True,exist_ok=True);(R/'assets/audio').mkdir(parents=True,exist_ok=True)
def run(tool,c,*args):
    subprocess.run([tool,'--config',str(c),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
fx=['gas-seep','drill-debris','jetpack-exhaust','ore-sparkle','material-shimmer','gas-explosion','lava-embers','impact-dust','core-extract','core-detonation','launch-exhaust','death-burst']
for i,n in enumerate(fx):
    c=T/f'{n}.json';c.write_text(json.dumps(dict(width=256,height=256,duration_ms=2000,fps=24,seed=31+i,actions=str(T/f'{n}-log.json'),preview=str(T/f'{n}.gif'),system=str(R/f'assets/fx/{n}.json'))))
    run('particle-2d',c,'init')
    color=['#b3d9c7','#b5a283','#ffb469','#c4ffeb','#a8fff0','#ffbc6c','#fc8754','#a99c87','#ffa276','#ffde9e','#ffb96a','#a4d8d9'][i]
    small=n in ['gas-seep','drill-debris','jetpack-exhaust','lava-embers','launch-exhaust']
    speed=15 if n=='gas-seep' else 60 if small else 75 if n=='ore-sparkle' else 130 if 'detonation' not in n else 280
    run('particle-2d',c,'add-emitter','--name','primary','--shape','disc','--x',128,'--y',128,'--radius',18 if n=='gas-seep' else 5,'--burst',12 if small else 18 if n=='ore-sparkle' else 140 if n=='core-detonation' else 65,'--lifetime',650 if n=='ore-sparkle' else 1500 if n in ['material-shimmer','core-detonation'] else 1100,'--lifetime-spread',400,'--speed',speed,'--speed-spread',speed*.4,'--dir-y',-1 if 'exhaust' in n else 1,'--cone-angle',18 if 'exhaust' in n else 30 if n=='gas-seep' else 180,'--seed',50+i)
    run('particle-2d',c,'set-particle','--emitter','primary','--size-from',.7 if n=='gas-seep' else .25 if n=='drill-debris' else .3 if n=='ore-sparkle' else 1 if n=='core-detonation' else .6,'--size-to',1.4 if n=='gas-seep' else 0,'--opacity-from',.14 if n=='gas-seep' else .8,'--opacity-to',0,'--color-gradient',color+'@0,#334550@1','--size-curve','ease-out','--opacity-curve','linear')
    run('particle-2d',c,'set-forces','--gravity',-15 if n=='gas-seep' else -100,'--drag',1,'--turbulence','15,0.04')
    if n=='material-shimmer':
        run('particle-2d',c,'add-emitter','--name','halo','--shape','disc','--x',128,'--y',128,'--radius',20,'--burst',28,'--lifetime',1500,'--speed',35,'--cone-angle',180)
        run('particle-2d',c,'set-particle','--emitter','halo','--size-from',.55,'--size-to',0,'--opacity-from',.7,'--opacity-to',0,'--color-gradient','#d5c6ff@0,#55bfc2@1')
    if 'explosion' in n or 'detonation' in n:
        run('particle-2d',c,'add-emitter','--name','shock','--shape','disc','--x',128,'--y',128,'--radius',3,'--burst',100,'--lifetime',300,'--speed',450,'--cone-angle',180)
        run('particle-2d',c,'set-particle','--emitter','shock','--size-from',.55,'--size-to',0,'--opacity-from',.7,'--opacity-to',0,'--color-gradient','#fff1c9@0,#ef7151@1')
    run('particle-2d',c,'render','--frame',12,'--out',T/f'{n}.png')
# Sounds: restrained levels, with noise beds and melodic metallic transients.
cues=['drill','thrust','ore-pickup','material-chime','gas-explosion','lava-sizzle','impact','fabricate','launch','death','alarm-fuel','alarm-core']
for i,n in enumerate(cues):
    c=T/f'sound-{n}.json';c.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=4000,seed=70+i,actions=str(T/f'sound-{n}-log.json'),preview=str(T/f'sound-{n}.png'),wav=str(R/f'assets/audio/{n}.wav'),sample_pack='combat-core')))
    tool='sfx-sample' if n in ['ore-pickup','material-chime','impact','fabricate'] else 'sfx-synth'
    run(tool,c,'init')
    dur=1800 if n=='launch' else 750 if n in ['drill','thrust','gas-explosion','death'] else 400
    fundamental=110 if n=='drill' else 45 if n=='thrust' else 70 if n in ['gas-explosion','launch','death','impact'] else 440 if n=='alarm-fuel' else 880 if n=='alarm-core' else 660
    voice='saw' if n=='drill' else 'sine' if n=='thrust' else 'square' if n.startswith('alarm') else 'triangle'
    for j,(wave,freq,gain) in enumerate([('noise',100,-27 if n in ['drill','thrust'] else -22),(voice,fundamental,-26)]):
        run(tool,c,'add-voice','--name',f'v{j}','--wave',wave,'--freq',freq,'--gain',gain,'--dur',dur)
        run(tool,c,'set-envelope','--voice',f'v{j}','--env','gate' if n in ['drill','thrust'] else 'pluck')
        if j:run(tool,c,'set-pitch','--voice',f'v{j}','--slide-to',80 if n=='drill' else 40 if n=='thrust' else 35 if freq==70 else 1100,'--over',dur)
    if n in ['ore-pickup','material-chime','fabricate']:
        for j,freq in enumerate([880,1320,1760] if n=='material-chime' else [880,1174]):
            run(tool,c,'add-voice','--name',f'bell{j}','--wave','sine','--freq',freq,'--gain',-23,'--start',j*65,'--dur',350)
            run(tool,c,'set-envelope','--voice',f'bell{j}','--env','pluck')
    if tool=='sfx-sample':
        sample={'impact':'impact_metal_hollow','ore-pickup':'mech_clip_load','material-chime':'zap_electric','fabricate':'mech_ratchet'}[n]
        run(tool,c,'add-sample','--name',sample,'--t',0,'--gain',-24,'--trim','0,500','--fade-out',80)
    run(tool,c,'render')
c=T/'music.json';c.write_text(json.dumps(dict(sample_rate=22050,channels='stereo',max_duration_ms=30000,seed=2026,instrument_bank='synthwave',actions=str(T/'music-log.json'),preview=str(T/'music.png'),wav=str(R/'assets/audio/music.wav'),mid=str(R/'assets/audio/music.mid'))))
run('music',c,'init');run('music',c,'set-tempo','--bpm',72)
run('music',c,'define-track','--name','abyss','--instrument','warm_pad');run('music',c,'set-track-fx','--track','abyss','--gain',-22,'--reverb',.5)
run('music',c,'define-track','--name','signal','--instrument','fm_bell');run('music',c,'set-track-fx','--track','signal','--gain',-24,'--reverb',.7)
for t in range(0,32,8):
    for p in [33,40,47]:run('music',c,'add-note','--track','abyss','--pitch',p-(2 if t==16 else 0),'--t',t,'--dur',8,'--velocity',55)
for t,p in [(0,69),(3,76),(6,71),(10,64),(13,69),(17,67),(20,74),(24,71),(27,64),(30,69)]:run('music',c,'add-note','--track','signal','--pitch',p,'--t',t,'--dur',1.8,'--velocity',40)
run('music',c,'render')
