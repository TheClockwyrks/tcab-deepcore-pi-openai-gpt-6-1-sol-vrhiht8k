"""One-time asset authoring. Not part of the production build."""
import json, subprocess, random, math
from pathlib import Path
random.seed(613)
ROOT=Path(__file__).resolve().parent.parent
A=ROOT/'assets'
TMP=Path('/tmp/deepcore-author'); TMP.mkdir(exist_ok=True)
ops=[]
def rect(x,y,w,h,c):
    if w>0 and h>0: ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=int(w),height=int(h),color=c))
def line(x1,y1,x2,y2,c): ops.append(dict(op='line',x0=int(x1),y0=int(y1),x1=int(x2),y1=int(y2),color=c))
def circ(x,y,r,c): ops.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def poly(points,c):
    for y in range(int(min(p[1] for p in points)),int(max(p[1] for p in points))+1):
        xs=[]
        for p,q in zip(points,points[1:]+points[:1]):
            if (p[1]<=y<q[1]) or (q[1]<=y<p[1]): xs.append(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]))
        xs.sort()
        for i in range(0,len(xs)-1,2): rect(math.ceil(xs[i]),y,math.floor(xs[i+1])-math.ceil(xs[i])+1,1,c)
def save(path,w=80,h=80,sheet=False):
    global ops
    dst=A/path; dst.parent.mkdir(parents=True,exist_ok=True)
    log=TMP/'drawing.json'; log.write_text(json.dumps(ops))
    subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(log),'--out',str(dst),'--width',str(w),'--height',str(h),'--no-layers'],check=True,stdout=subprocess.DEVNULL)
    ops=[]
def shade(c,k):
    return '#'+''.join(f'{max(0,min(255,int(int(c[i:i+2],16)*k))):02x}' for i in (1,3,5))
pal=['#665043','#454f56','#313d49','#493336']
for b,base in zip(['topsoil','rockbed','deepstone','coreshell'],pal):
    for n in range(3):
        rect(0,0,80,80,base)
        for i in range(1100):
            x=random.randrange(80);y=random.randrange(80)
            rect(x,y,random.choice([1,2,3]),random.choice([1,1,2]),shade(base,random.uniform(.65,1.35)))
        for i in range(16):
            x=random.randrange(80);y=random.randrange(80)
            line(x,y,x+random.randrange(3,12),y-random.randrange(0,4),shade(base,.55))
            line(x,y+1,x+5,y,shade(base,1.18))
        save(Path(f'tiles/{b}-{n}.png'))
rect(0,0,80,80,'#141f29')
for y in range(0,80,20):
    for x in range(-20,80,40):
        xx=x+(20 if y%40 else 0);rect(xx+1,y+1,38,18,'#35434e');line(xx+3,y+2,xx+35,y+2,'#64717a')
        for i in range(14):rect(xx+random.randrange(38),y+random.randrange(18),2,1,'#283540')
save(Path('tiles/bedrock.png'))
for n in range(2):
    poly([(5,25),(22,6),(59,3+n*6),(76,27),(73,62),(55,76),(17,70),(2,53)],'#101c29')
    poly([(9,26),(24,10),(57,8),(70,28),(66,58),(52,69),(19,63),(8,49)],'#718692')
    poly([(9,26),(24,10),(57,8),(43,29),(17,40)],'#a1b3b9')
    poly([(17,40),(43,29),(70,28),(66,58),(52,69),(19,63)],'#425766')
    line(23,13,16,30,'#c6d9da');line(21,55,52,63,'#273d4e')
    for i in range(20):rect(random.randrange(17,60),random.randrange(20,60),2,1,'#91a3a9')
    save(Path(f'tiles/stone-{n}.png'))
rect(0,0,80,80,'#101c24')
for i in range(450): rect(random.randrange(80),random.randrange(80),2,1,random.choice(['#142129','#18262d','#0e1921']))
save(Path('tiles/tunnel.png'))
colors=['#c8a790','#d5c478','#e68758','#d5e3e0','#689ee1','#78dfdb','#c7c5ef','#ef9c54','#ed6b67','#9ee7ff','#83ebac','#f19dc5','#f7dc8b']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for n,col in zip(names,colors):
    if n not in names[-3:]:
        for i in range(650):
            x=random.randrange(80); center=40+math.sin(x/21)*12
            y=int(random.gauss(center,8))
            rect(x,y,random.randrange(1,5),random.randrange(1,3),shade(col,random.uniform(.55,1.3))+random.choice(['80','bb','ee']))
        for x in range(0,80,5): line(x,int(40+math.sin(x/21)*12),x+6,int(39+math.sin((x+6)/21)*12),shade(col,1.2))
    else:
        poly([(40,12),(59,22),(65,43),(40,66),(15,43),(21,22)],'#101e2b')
        poly([(40,16),(57,25),(60,42),(40,61),(20,42),(24,25)],col)
        poly([(24,25),(40,16),(35,35),(20,42)],shade(col,1.25));poly([(35,35),(57,25),(60,42),(40,61)],shade(col,.62))
        poly([(35,28),(49,28),(50,39),(36,43),(29,37)],shade(col,1.15))
        line(24,20,24,32,'#ffffff');line(18,26,30,26,'#ffffff');rect(53,44,3,3,'#ffffff')
    save(Path(f'ore/{n}.png'))
for name,c in [('resonite','#8af5d5'),('cryenite','#aaadff'),('core','#ff8253'),('core-sample','#ffb86a')]:
    if name.startswith('core'):
        for r in range(35,10,-3):circ(40,40,r,c+f'{int(20+(35-r)*5):02x}')
        poly([(30,23),(47,19),(60,39),(47,58),(30,56),(22,39)],c)
        poly([(30,23),(47,19),(41,38),(22,39)],'#ffdfaa');poly([(41,38),(60,39),(47,58)],'#c94a3a')
        line(15,16,23,23,c);line(63,57,69,64,c)
    else:
        for x,y,h in [(20,56,32),(37,65,53),(53,58,35)]:
            poly([(x-9,y),(x-9,y-h+8),(x,y-h),(x+10,y-h+10),(x+8,y)],'#132534')
            poly([(x-6,y-3),(x-6,y-h+10),(x,y-h+3),(x+6,y-h+12),(x+5,y-3)],c)
            poly([(x,y-h+3),(x+6,y-h+12),(x+5,y-3),(x,y-8)],shade(c,.6))
            line(x-4,y-h+11,x-4,y-10,'#e1fff4')
        for i in range(20):rect(random.randrange(12,68),random.randrange(15,68),2,2,c+'88')
    save(Path(f'materials/{name}.png'))
for f in range(4):
    for k in range(f+2):
        x=40;y=38
        for j in range(4):
            nx=x+random.randrange(-18,19);ny=y+random.randrange(-18,19)
            line(x,y,nx,ny,'#111722dd');line(x+1,y,nx+1,ny,'#c7b29788');x=nx;y=ny
    save(Path(f'tiles/crack/frame{f:02}.png'),sheet=True)
for f in range(4):
    rect(0,0,80,80,'#9d362f')
    for y in range(80):
        for x in range(0,80,3):
            v=math.sin(x/13+y/11+f*1.6)+math.cos(x/9-y/17+f)
            rect(x,y,3,1,'#ffce75' if v>1.5 else '#f58a47' if v>.4 else '#d45331' if v>-.8 else '#812c30')
    save(Path(f'hazards/lava/frame{f:02}.png'),sheet=True)
# The prospector: the same helmet, pressure suit, tank and spiral drill in every pose.
for state,count in [('idle',4),('walk',6),('drill-down',4),('drill-side',4),('jetpack',4),('fall',4),('hurt',3),('fuel-out',3)]:
    for f in range(count):
        bob=([0,1,2,1][f%4] if state=='idle' else [0,-1,0,1][f%4] if state=='fall' else f%2 if 'drill' in state or state=='fuel-out' else 0)
        by=7+bob+(5 if state=='fuel-out' else -3 if state=='jetpack' else 0)
        if state=='hurt':by+=f*2
        # exhaust behind tank
        if state=='jetpack':
            poly([(14,50),(26,50),(24,62+f*3),(18,76-f*2),(13,62)],'#ee7445')
            poly([(17,49),(23,49),(20,67-f*2)],'#fff4b0')
        rect(9,by+22,16,29,'#101d29');rect(11,by+24,12,23,'#637c83');rect(11,by+26,4,18,'#9cb2ac');rect(12,by+48,10,5,'#243a45')
        # legs articulate around a heavy hip
        stride=([-5,0,5,8,2,-4][f%6] if state=='walk' else [3,6,5,2][f%4] if state=='fall' else -2 if state=='fuel-out' else 0)
        for x,off in [(26,stride),(42,-stride)]:
            yy=by+42+(3 if state=='drill-down' else 0)
            poly([(x,yy),(x+11,yy),(x+13+off,yy+20),(x-1+off,yy+20)],'#111f2a')
            rect(x+2+off//2,yy+3,8,12,'#b9b5a0');rect(x+1+off,yy+14,12,6,'#52656b');rect(x-1+off,yy+20,17,5,'#101e29');rect(x+off,yy+20,13,2,'#849691')
        # pressure torso
        poly([(23,by+24),(45,by+22),(54,by+35),(48,by+49),(25,by+48),(20,by+34)],'#101e2a')
        rect(25,by+25,22,21,'#c4bea5');rect(25,by+25,7,20,'#e7d4a9');rect(27,by+41,21,7,'#a96f46');rect(28,by+44,19,3,'#263c45')
        rect(36,by+29,11,8,'#314b54');rect(38,by+30,3,4,'#81e8dd');rect(43,by+31,2,2,'#e9b96e')
        # neck and helmet, orange shell and blue glass
        hy=by+(5 if state=='fuel-out' else 0);hx=4 if state=='fuel-out' else 0
        rect(28,by+19,17,9,'#182935');circ(38+hx,hy+13,17,'#12232f');circ(38+hx,hy+12,15,'#e1a35c');rect(27+hx,hy,20,5,'#f4ce8b')
        rect(29+hx,hy+7,25,16,'#162e40');rect(32+hx,hy+9,20,9,'#63b9c6' if state!='fuel-out' else '#416771');rect(34+hx,hy+9,16,3,'#b1e5df' if state!='fuel-out' else '#5f8b91');rect(45+hx,hy+14,6,5,'#347f96')
        rect(24+hx,hy+11,5,10,'#80765f');rect(24+hx,hy+13,3,5,'#d5d1ac')
        rect(45+hx,hy+1,9,6,'#223b47');rect(48+hx,hy+2,6,3,'#46585e' if state=='fuel-out' else '#fff2b4' if f%2 else '#cbeadd')
        # arm and drill change with the action
        down=state=='drill-down'
        dx=48+(f%2*2 if 'drill' in state else 0);dy=by+36
        if down:
            rect(43,by+29,10,18,'#243942');rect(45,by+31,8,10,'#e2c18c');rect(47,by+43,13,13,'#c19757');rect(49,by+55,9,12,'#728d91')
            poly([(49,by+65),(58,by+65),(54,79)],'#ccd5c6')
            for j in range(4):line(49,by+56+j*3,57,by+54+j*3,'#1c3842')
        else:
            ay=dy+(8 if state=='fuel-out' else -7+f%2*2 if state=='fall' else stride//3 if state=='walk' else 0)
            rect(43,ay-5,13,10,'#1b303b');rect(45,ay-4,10,7,'#d6bb8b');rect(53,ay,12,7,'#263e47')
            rect(dx+6,ay+1,14,12,'#1c303c');rect(dx+8,ay+2,12,8,'#d4a65f');rect(dx+10,ay+3,7,2,'#f6d89a')
            poly([(dx+20,ay+3),(79,ay+7),(dx+20,ay+12)],'#a4b6b3')
            for j in range(4):line(dx+21+j*2,ay+4,dx+19+j*2,ay+10,'#344e58')
        if state=='hurt':line(60,8,68,1,'#ffe5b1');line(63,17,76,15,'#ffe5b1')
        save(Path(f'miner/{state}/frame{f:02}.png'),sheet=True)
# Painted panorama with layered ridges, industrial haze and cold stars.
for y in range(520):
    t=y/520;rect(0,y,1280,1,'#'+''.join(f'{int(a+(b-a)*t):02x}' for a,b in zip((9,20,30),(49,64,66))))
for i in range(190):
    x=random.randrange(1280);y=random.randrange(330);rect(x,y,1 if i%4 else 2,1,random.choice(['#48616c','#75918e','#afbbb0']))
circ(1010,108,39,'#71847f');circ(1000,100,39,'#3c535b')
for layer,c,y0 in [(0,'#283c44',315),(1,'#20323b',370),(2,'#162932',430)]:
    pts=[(0,520),(0,y0)]+[(x,y0+random.randrange(-65,45)) for x in range(0,1320,60)]+[(1280,520)]
    poly(pts,c)
    for i in range(30):rect(random.randrange(1280),y0+random.randrange(10,70),random.randrange(3,20),2,shade(c,1.1))
save(Path('surface/sky.png'),1280,520)
rect(0,0,80,80,'#283a40');rect(0,0,80,7,'#a6926b');rect(0,7,80,4,'#1a2931')
for i in range(300):rect(random.randrange(80),random.randrange(12,80),random.randrange(1,4),1,random.choice(['#34464a','#203238','#475352']))
for x in range(0,80,20):poly([(x,0),(x+9,0),(x+2,6),(x-7,6)],'#dfb56c')
save(Path('surface/ground.png'))
poly([(4,78),(7,30),(22,13),(58,10),(75,31),(78,78)],'#21333b');poly([(14,80),(18,32),(30,22),(53,22),(65,36),(68,80)],'#080f19');line(21,29,29,20,'#b29364');line(57,22,66,34,'#b29364');save(Path('surface/cave-mouth.png'))
for idx,name in enumerate(['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']):
    w=240;h=160
    rect(8,145,224,15,'#0d1c27');rect(4,141,232,6,'#8b9b93');rect(10,147,220,3,'#3f555c')
    if name=='save-pad':
        rect(32,130,176,10,'#467d7c');rect(38,133,164,3,'#80cbb9');rect(96,45,48,88,'#152a36');rect(101,49,38,76,'#4f7279');rect(105,55,30,37,'#132b38');rect(110,60,20,22,'#72d7ca');rect(114,64,12,3,'#d5ffee');rect(108,101,24,4,'#d7bd82');rect(66,118,8,20,'#c0c5ab');rect(169,118,8,20,'#c0c5ab')
    elif name=='launch-pad':
        rect(35,124,170,16,'#455c65');rect(32,120,176,5,'#c5b998');rect(183,15,12,109,'#495d66')
        for y in range(20,120,17):line(184,y,194,y+16,'#99aaa3');line(194,y,184,y+16,'#99aaa3')
        rect(160,15,48,6,'#889a96');rect(167,20,5,54,'#596f74')
    else:
        c=['#c49a63','#739d9c','#697f89','#9a9a73','#a68d6e'][idx if idx<2 else idx-1]
        poly([(23,68),(46,41),(186,41),(216,67),(216,139),(23,139)],'#142632')
        poly([(27,66),(49,45),(182,45),(211,66)],'#7d8f8c');rect(27,68,184,68,'#4b626a');rect(31,73,176,60,c)
        for x in range(35,210,9):rect(x,75,2,57,shade(c,.7))
        rect(68,89,51,49,'#152c38');rect(73,93,41,42,'#2c4652');rect(78,96,31,12,'#6db2b7');rect(103,118,3,6,'#ebc886')
        rect(130,86,64,31,'#182e3b');rect(134,90,56,20,'#65a7ae');rect(139,93,45,3,'#a0d3cc');rect(160,90,3,20,'#304f5a')
        rect(48,53,140,18,'#142b37');rect(54,57,128,3,'#dab678');rect(54,63,88,2,'#6c9b9b')
        rect(35,21,6,30,'#536d74');rect(31,17,14,8,'#a6b9ae');rect(35,13,5,7,'#d6be87')
        if name=='fuel-depot':
            rect(7,84,41,51,'#243b46');circ(27,84,20,'#829e9b');rect(10,84,35,43,'#b58d5b');rect(15,92,25,8,'#263d47');rect(21,109,12,14,'#e3bc75')
        if name=='ore-market':
            rect(7,125,50,12,'#172c37');rect(10,122,44,4,'#aab5a3');rect(28,93,5,30,'#617c7e');circ(31,98,12,'#19313b');circ(31,98,8,'#9db9ad');line(31,98,34,92,'#334c53')
            for x,y in [(201,121),(216,130),(199,136)]:poly([(x,y),(x+11,y-4),(x+18,y+6),(x+9,y+12),(x-3,y+7)],'#8d9a92');line(x+1,y,x+8,y-2,'#c9c7ac')
        if name=='upgrade-shop':
            rect(181,6,8,37,'#617c81');line(155,11,214,11,'#809c9b');line(164,16,205,16,'#809c9b');circ(185,10,5,'#d9bc75')
        if name=='supply-depot':
            for x,y in [(8,123),(198,119),(190,133)]:rect(x,y,28,17,'#263b45');rect(x+2,y+2,24,12,'#9b8d69');line(x+3,y+3,x+23,y+12,'#4e594f')
    for x in [16,224]:rect(x,143,3,12,'#d7c59b')
    save(Path(f'surface/{name}.png'),240,160)
for n in range(6):
    rect(10,200,140,16,'#5a7179');rect(4,198,152,5,'#b1b6a1')
    if n:
        poly([(55,196),(55,63),(80,14),(105,63),(105,196)],'#152b38')
        poly([(60,192),(60,64),(80,22),(100,64),(100,192)],'#d1cfb1')
        rect(60,67,40,100,'#a9b9ae');rect(63,69,12,94,'#e1dec1');rect(90,67,10,126,'#728d90')
        rect(60,174,40,11,'#bc7952');rect(64,189,32,9,'#273f4c')
    if n:
        for yy in [68,111,165]:line(61,yy,99,yy,'#617b82');line(63,yy+1,89,yy+1,'#e0dfc4')
        for yy in range(72,164,16):rect(61,yy,2,2,'#48636f');rect(97,yy,2,2,'#48636f')
        rect(76,102,10,4,'#a97b4d');rect(78,94,6,6,'#b68e59');line(75,107,87,107,'#536e78')
        for yy in range(144,158,3):rect(77,yy,9,1,'#496571')
        rect(70,72,12,2,'#637c7d');rect(70,76,8,1,'#637c7d')
        for xx in range(62,98,8):poly([(xx,175),(xx+4,175),(xx+1,182),(xx-3,182)],'#e2bf7b')
    if n>=2:
        for x in [39,101]:
            rect(x,111,20,78,'#172f3e');rect(x+3,115,14,70,'#93a9a5');rect(x+5,119,5,60,'#d7d5b5')
            rect(x+2,129,16,4,'#667e7f');rect(x+2,171,16,4,'#667e7f');rect(x+7,181,6,6,'#2d4a58');rect(x+4,187,13,4,'#172e3d')
    if n>=3:circ(80,85,13,'#253e4b');circ(80,85,9,'#6dd5d0');circ(77,82,4,'#c0efe0')
    if n>=4:
        poly([(60,152),(40,192),(35,192),(37,161)],'#c4945f');poly([(100,152),(120,192),(125,192),(123,161)],'#ad7c52')
        rect(67,192,26,9,'#162a36')
    if n>=5:rect(71,124,18,25,'#243e48');rect(75,129,10,14,'#f4b66c');rect(71,151,18,4,'#ab7750')
    save(Path(f'rocket/stage{n}.png'),160,220,sheet=True)
for i,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
    c=['#e8ba77','#db957c','#b9ccc0','#e8ce8e','#9cbac6','#8af5d5','#aaadff','#ffb86a'][i]
    if name=='fuel':poly([(7,2),(15,2),(15,6),(19,9),(19,21),(5,21),(5,7),(7,7)],c);rect(8,10,8,6,'#2b424a')
    elif name=='hull':poly([(3,4),(12,1),(21,4),(19,15),(12,22),(5,15)],c);poly([(7,7),(12,5),(17,7),(15,14),(12,17),(9,14)],'#2b424a')
    elif name=='cargo':rect(3,6,18,15,c);rect(8,2,8,5,c);rect(6,9,12,2,'#2b424a');rect(10,12,4,7,'#2b424a')
    elif name=='credits':circ(12,12,10,c);circ(12,12,7,'#2b424a');line(10,7,15,7,c);line(10,7,10,16,c);line(10,16,15,16,c)
    elif name=='depth':rect(10,2,4,14,c);poly([(4,13),(20,13),(12,22)],c)
    else:poly([(12,1),(21,9),(17,20),(8,22),(3,10)],c);poly([(12,1),(12,13),(3,10)],shade(c,.65));line(13,5,18,10,'#ffffff')
    save(Path(f'icons/{name}.png'),24,24)
print('Artwork complete')
