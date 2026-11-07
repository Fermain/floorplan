"""Draws the Floorplan logo files in static/brand from exact geometry.

The symbol is a 40-unit box with 4-unit walls. The name is Instrument Sans SemiBold as
outlines, cap height 24 (top of the wall to the head of the door leaf). The measure line
is 1.5 thick, centred in the floor wall, with ticks a wall thick on the ink edges of F
and n. PRO is IBM Plex Mono SemiBold, cap height 4 (6 in the small versions).

Every part is a filled shape, with no strokes.

Usage: python scripts/brand/generate.py   (needs fonttools; fetches the two fonts)
"""
import os, urllib.request
from fontTools.varLib.instancer import instantiateVariableFont
HERE=os.path.dirname(os.path.abspath(__file__))
FONTS=os.path.join(HERE,'fonts'); OUT=os.path.join(HERE,'..','..','static','brand')
os.makedirs(FONTS,exist_ok=True)
_SRC={'InstrumentSans.ttf':'https://github.com/google/fonts/raw/main/ofl/instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf',
      'PlexMonoSemiBold.ttf':'https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-SemiBold.ttf'}
for name,url in _SRC.items():
    if not os.path.exists(os.path.join(FONTS,name)): urllib.request.urlretrieve(url,os.path.join(FONTS,name))
if not os.path.exists(os.path.join(FONTS,'InstrumentSans-SemiBold.ttf')):
    from fontTools.ttLib import TTFont as _T
    instantiateVariableFont(_T(os.path.join(FONTS,'InstrumentSans.ttf')),{'wght':600,'wdth':100}).save(os.path.join(FONTS,'InstrumentSans-SemiBold.ttf'))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

def text_path(font, s, scale, x0, baseline, tracking=0):
    gs=font.getGlyphSet(); cmap=font.getBestCmap()
    pen=SVGPathPen(gs, ntos=lambda v: ('%.2f'%v).rstrip('0').rstrip('.')); x=x0; xmin=None; xmax=None
    for ch in s:
        g=gs[cmap[ord(ch)]]
        tp=TransformPen(pen,(scale,0,0,-scale,x,baseline)); g.draw(tp)
        bp=BoundsPen(gs); g.draw(bp)
        if bp.bounds:
            l=x+bp.bounds[0]*scale; r=x+bp.bounds[2]*scale
            xmin=l if xmin is None else min(xmin,l); xmax=r if xmax is None else max(xmax,r)
        x+=g.width*scale+tracking
    return pen.getCommands(), xmin, xmax, x-tracking

def num(v): return ('%.3f'%v).rstrip('0').rstrip('.')

sans=TTFont(FONTS+'/InstrumentSans-SemiBold.ttf'); mono=TTFont(FONTS+'/PlexMonoSemiBold.ttf')
CAP=720; MCAP=698; GAP=8

def symbol(ink, arc, window=True, small=False):
    if small:  # 16px: 6-unit walls in the same 40 box
        return (f'<path d="M0 0H14V6H6V40H0Z M26 0H40V40H23V34H34V6H26Z" fill="{ink}"/>'
                f'<rect x="20" y="26" width="3" height="14" fill="{ink}"/>'
                f'<path d="M20 26A14 14 0 0 0 6 40H9A11 11 0 0 1 20 29Z" fill="{arc}"/>')
    walls=('<path fill-rule="evenodd" d="M0 0H40V40H22V36H36V4H4V40H0Z M14 1H26V3H14Z"' if window
           else '<path d="M0 0H14V4H4V40H0Z M26 0H40V40H22V36H36V4H26Z"')
    return (walls+f' fill="{ink}"/>'
            f'<rect x="20" y="24" width="2" height="16" fill="{ink}"/>'
            f'<path d="M20 24A16 16 0 0 0 4 40H5.5A14.5 14.5 0 0 1 20 25.5Z" fill="{arc}"/>')

def lockup(ink, arc, pro=True, small=False):
    s=24/CAP
    # place F ink edge at x=40+GAP
    _,xmin,_,_=text_path(sans,'Floorplan',s,0,24)
    d,l,r,_=text_path(sans,'Floorplan',s,40+GAP-xmin,24)
    parts=[symbol(ink,arc,window=not small), f'<path d="{d}" fill="{ink}"/>']
    if small: line_y, tick=(36.5,(33.5,39.5)); pcap=6
    else: line_y, tick=(38,(36,40)); pcap=4
    sw=1.5
    th=tick[1]-tick[0]
    def rect(x,y,w,h): return f'M{num(x)} {num(y)}h{num(w)}v{num(h)}h{num(-w)}Z'
    ticks=rect(l,tick[0],sw,th)+rect(r-sw,tick[0],sw,th)
    if pro:
        ms=pcap/MCAP; tr=0.18*pcap
        _,_,_,adv=text_path(mono,'PRO',ms,0,0,tr)
        cx=(l+r)/2; px=cx-adv/2
        pd,pl,pr,_=text_path(mono,"PRO",ms,px,line_y+pcap/2-0.12,tr)
        g=1.8*pcap/4*1.2
        lines=rect(l,line_y-sw/2,pl-g-l,sw)+rect(pr+g,line_y-sw/2,r-pr-g,sw)
        parts.append(f'<path d="{lines}{ticks}" fill="{arc}"/>')
        parts.append(f'<path d="{pd}" fill="{arc}"/>')
    else:
        parts.append(f'<path d="{rect(l,line_y-sw/2,r-l,sw)}{ticks}" fill="{arc}"/>')
    w=r
    return w, ''.join(parts)

INK,PAPER,BLUE,PALE='#1B2430','#F6F4EE','#1F4FA3','#9FB7E6'
out={}
for name,(ink,arc,pro,small) in {
 'floorplan-pro':(INK,BLUE,True,False),'floorplan-pro-dark':(PAPER,PALE,True,False),
 'floorplan-pro-small':(INK,BLUE,True,True),'floorplan-pro-small-dark':(PAPER,PALE,True,True),
 'floorplan':(INK,BLUE,False,False),'floorplan-dark':(PAPER,PALE,False,False)}.items():
    w,body=lockup(ink,arc,pro,small)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(w)} 40">{body}</svg>'
    open(f'{OUT}/{name}.svg','w').write(svg); out[name]=(w,body)
for name,(ink,arc,win,small) in {'symbol':(INK,BLUE,True,False),'symbol-void':(INK,BLUE,False,False),'symbol-16':(INK,BLUE,False,True),
    'symbol-dark':(PAPER,PALE,True,False)}.items():
    open(f'{OUT}/{name}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">{symbol(ink,arc,win,small)}</svg>')
print({k:round(v[0],2) for k,v in out.items()})
