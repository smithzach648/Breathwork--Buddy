export const pages=['Home','Practice','Journal','History','Settings'] as const;
export type Page=typeof pages[number];
const marks:Record<Page,string>={Home:'⌂',Practice:'◌',Journal:'▤',History:'◷',Settings:'⚙'};
export function Navigation({page,onNavigate}:{page:Page;onNavigate:(page:Page)=>void}) {
  return <nav aria-label="Main navigation">{pages.map(name=><button key={name} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)}>
    <span aria-hidden="true">{marks[name]}</span>{name}
  </button>)}</nav>;
}
