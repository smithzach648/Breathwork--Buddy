"""Reuse original Marshall audio; leave published recordings and all journeys unchanged."""
from pathlib import Path
import array, hashlib, json, math, shutil, subprocess
repo=Path(__file__).resolve().parents[1]
root=repo.parent/'narration-auditions'
ffmpeg=root/'tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe'
rows=[]
for name,folder in [('BREATHWORK_MARSHALL_PRODUCTION','practice-originals'),('HORMESIS_MARSHALL_PRODUCTION','hormesis-originals'),('REFINEMENT_MARSHALL_PRODUCTION','refinement-originals')]:
 for row in json.loads((repo/f'docs/meditation-suite/{name}.json').read_text(encoding='utf-8'))['clips']:
  rows.append((row,root/folder/(row['id']+'.mp3')))
assets={};mapping={};brief={};ledger=[]
def run(args):
 return subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-nostdin',*args],check=True,stdout=subprocess.PIPE).stdout
def record(id,script,source,old,cut=None):
 target=repo/'public/audio/voice'/(id+'.mp3')
 if cut is None:shutil.copyfile(source,target)
 else:run(['-y','-i',str(source),'-t',str(cut),'-af',f'afade=t=out:st={max(0,cut-.02)}:d=0.02','-map_metadata','-1','-c:a','libmp3lame','-b:a','128k',str(target)])
 pcm=array.array('f');pcm.frombytes(run(['-i',str(target),'-f','f32le','-ac','1','-ar','44100','pipe:1']))
 seconds=len(pcm)/44100
 assert pcm and all(math.isfinite(v) for v in pcm) and max(abs(v) for v in pcm)<1
 asset={'id':id,'script':script,'maxSeconds':max(seconds+.1,old['maxSeconds'] if cut is None else seconds+.35),'assetId':id,'durationSeconds':seconds,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'approved':True}
 assets[id]=asset;ledger.append({**asset,'sourceId':old['id'],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceCutSeconds':cut,'newCredits':0})
 return id
for old,source in rows:
 id=old['id'].replace('practice.','practice.compact.',1)
 mapping[old['id']]=record(id,old['script'],source,old)
 keys={'practice.intro.box.1':'box','practice.intro.478.1':'478','practice.intro.calm.1':'calm','practice.intro.coherent.1':'coherent','practice.intro.custom.1':'custom','practice.intro.hormesis.1':'hormesis','practice.intro.hormesis-foundation.2':'hormesis-foundation','practice.intro.hormesis-advanced.2':'hormesis-advanced','practice.intro.hormesis-two.1':'hormesis-two'}
 if old['id'] in keys:
  key=keys[old['id']];gap=old['splices'][1 if key=='hormesis' else 0]
  script=old['script'].split('. ')[0]+'.'
  brief[key]=record('practice.brief.'+key+'.1',script,source,old,gap['sourceFrame']/44100)
 if old['id']=='practice.voice.hold60.1':
  hold=record('practice.brief.hold.1','Let the breath pause.',source,old,old['splices'][0]['sourceFrame']/44100)
output="import type {PracticeNarrationAsset} from './practice-narration';\n"
output+='export const COMPACT_NARRATION:Readonly<Record<string,PracticeNarrationAsset>>=Object.freeze('+json.dumps(assets,indent=2)+');\n'
output+='export const COMPACT_BY_SOURCE:Readonly<Record<string,string>>='+json.dumps(mapping,indent=2)+';\n'
output+='export const BRIEF_INTROS:Readonly<Record<string,string>>='+json.dumps(brief,indent=2)+';\n'
output+="export const BRIEF_HOLD='"+hold+"';\n"
(repo/'src/audio/compact-narration.ts').write_text(output,encoding='utf-8')
catalog=[{'id':a['id'],'category':'voice','name':a['id'],'localPath':'audio/voice/'+a['id']+'.mp3','durationSeconds':a['durationSeconds'],'loop':False,'available':True,'sourceNotes':'Existing user-approved Marshall recording; natural original pacing or a phrase excerpt; zero new generation credits.'} for a in assets.values()]
(repo/'src/audio/compact-audio-catalog.ts').write_text("import type {AudioAsset} from './catalog';\nexport const compactAudioCatalog:readonly AudioAsset[]="+json.dumps(catalog,indent=2)+';\n',encoding='utf-8')
(repo/'docs/meditation-suite/COMPACT_PRACTICE_PRODUCTION.json').write_text(json.dumps({'newCredits':0,'voice':'Marshall','originalAssetsUnchanged':True,'journeysUnchanged':True,'clips':ledger},indent=2),encoding='utf-8')
print(json.dumps({'assets':len(assets),'newCredits':0,'fullIntroSeconds':[(r['sourceId'],r['durationSeconds']) for r in ledger if '.compact.intro.' in r['id']],'brief':brief},indent=2))
