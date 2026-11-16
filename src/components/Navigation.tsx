export const pages=['Home','Practice','Meditate','Meditation','Journal','History','Settings'] as const;
export type Page=typeof pages[number];
const marks:Record<Page,string>={Home:'⌂',Practice:'◌',Meditate:'◉',Meditation:'◇',Journal:'▤',History:'◷',Settings:'⚙'};
export function Navigation({page,onNavigate}:{page:Page;onNavigate:(page:Page)=>void}) {
  return <nav aria-label="Main navigation">{pages.map(name=><button key={name} aria-label={name==='Meditation'?name:undefined} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)}>
    <span aria-hidden="true">{marks[name]}</span><span className="nav-label">{name==='Meditation'?'Timer':name}</span>
  </button>)}</nav>;
}
