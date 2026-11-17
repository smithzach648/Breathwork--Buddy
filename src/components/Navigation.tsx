import {Icon} from './Icon';
export const pages=['Home','Practices','Saved','Reflect','Practice','Meditate','Meditation','Journal','History','Settings'] as const;
export type Page=typeof pages[number];
export const navigationPages=['Home','Practices','Saved','Reflect'] as const;
export function Navigation({page,onNavigate}:{page:Page;onNavigate:(page:Page)=>void}) {
  const current=['Practice','Meditate','Meditation'].includes(page)?'Practices':['Journal','History'].includes(page)?'Reflect':page;
  return <nav className="bottom-nav" aria-label="Main navigation">{navigationPages.map(name=><button className="nav-button" key={name} aria-current={current===name?'page':undefined} onClick={()=>onNavigate(name)}>
    <Icon name={{Home:'home',Practices:'practice',Saved:'saved',Reflect:'reflect'}[name]}/><span className="nav-label">{name}</span>
  </button>)}</nav>;
}
