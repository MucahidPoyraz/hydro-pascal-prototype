'use client';

import {forwardRef,useCallback,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './admin-system.css';

const variants={
  primary:'admin-button-primary',
  secondary:'admin-button-secondary',
  danger:'admin-button-danger',
  ghost:'admin-button-ghost',
  icon:'admin-button-icon'
};

export const AdminButton=forwardRef(function AdminButton({variant='secondary',size='regular',className='',type='button',children,...props},ref){
  return <button ref={ref} type={type} className={`admin-button ${variants[variant]||variants.secondary} admin-button-${size} ${className}`.trim()} {...props}>{children}</button>;
});

export function AdminOrderButtons({label='Sıralama',onMoveUp,onMoveDown,canMoveUp=true,canMoveDown=true,moveUpLabel='Yukarı taşı',moveDownLabel='Aşağı taşı',orientation='horizontal',className=''}){
  const groupClass=`admin-order-buttons${orientation==='vertical'?' is-vertical':''}${className?' '+className:''}`;
  return <div className={groupClass} role="group" aria-label={label}>
    <AdminButton size="compact" variant="icon" className="admin-order-button" aria-label={`${label}: ${moveUpLabel}`} title={moveUpLabel} disabled={!canMoveUp} onClick={onMoveUp}>↑</AdminButton>
    <AdminButton size="compact" variant="icon" className="admin-order-button" aria-label={`${label}: ${moveDownLabel}`} title={moveDownLabel} disabled={!canMoveDown} onClick={onMoveDown}>↓</AdminButton>
  </div>;
}

export function AdminStatusBadge({status='draft',children}){
  const normalized=['published','active'].includes(status)?'published':status==='warning'?'warning':'draft';
  return <span className={`admin-status-badge admin-status-${normalized}`}>{children||({published:'Yayında',draft:'Taslak',warning:'Kontrol gerekli'}[normalized])}</span>;
}

// List-screen header: eyebrow, title (+count), description and right-aligned actions.
export function PageHeader({eyebrow,title,count,description,actions,className=''}){
  return <div className={`products-page-heading admin-page-header ${className}`.trim()}>
    <div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h3>{title}{count!==undefined&&count!==null&&<small className="muted-count">{count}</small>}</h3>{description&&<p>{description}</p>}</div>
    {actions&&<div className="admin-heading-actions">{actions}</div>}
  </div>;
}

// The large white container every list/editor screen sits in.
export function ContentCard({className='',children,...props}){
  return <section className={`panel admin-content-card ${className}`.trim()} {...props}>{children}</section>;
}

// Row actions: the main action stays visible, everything else goes into a ••• menu.
export function RowActions({children,items=[],label='Diğer işlemler'}){
  const menuItems=items.filter(item=>item&&!item.hidden);
  const [open,setOpen]=useState(false),[position,setPosition]=useState(null);
  const trigger=useRef(null),menu=useRef(null),menuId=useId();
  const close=useCallback((focusTrigger=false)=>{setOpen(false);if(focusTrigger)requestAnimationFrame(()=>trigger.current?.focus());},[]);
  useEffect(()=>{
    if(!open)return;
    const box=trigger.current.getBoundingClientRect(),width=210;
    setPosition({top:Math.min(box.bottom+4,window.innerHeight-12-40*menuItems.length),left:Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))});
    const outside=event=>{if(!menu.current?.contains(event.target)&&!trigger.current?.contains(event.target))close();};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();close(true);}};
    const dismiss=()=>close();
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};
  },[open,close,menuItems.length]);
  // Move focus into the menu only once it is rendered at its position.
  useEffect(()=>{if(open&&position)menu.current?.querySelector('[role=menuitem]:not(:disabled)')?.focus();},[open,position]);
  const onMenuKeyDown=event=>{
    const buttons=[...menu.current.querySelectorAll('[role=menuitem]:not(:disabled)')];
    const index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopPropagation();close(true);}
    else if(event.key==='ArrowDown'){event.preventDefault();buttons[(index+1)%buttons.length]?.focus();}
    else if(event.key==='ArrowUp'){event.preventDefault();buttons[(index-1+buttons.length)%buttons.length]?.focus();}
    else if(event.key==='Home'){event.preventDefault();buttons[0]?.focus();}
    else if(event.key==='End'){event.preventDefault();buttons.at(-1)?.focus();}
  };
  return <div className="admin-row-actions">
    {children}
    {menuItems.length>0&&<>
      <AdminButton ref={trigger} size="compact" variant="icon" className="row-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined} aria-label={label} title={label} onClick={()=>setOpen(value=>!value)}>•••</AdminButton>
      {open&&position&&typeof document!=='undefined'&&createPortal(<div ref={menu} id={menuId} role="menu" aria-label={label} className="row-menu" style={{top:position.top,left:position.left}} onKeyDown={onMenuKeyDown}>
        {menuItems.map(item=><button key={item.label} type="button" role="menuitem" className={'row-menu-item'+(item.variant==='danger'?' is-danger':'')} disabled={Boolean(item.disabled)} title={typeof item.disabled==='string'?item.disabled:undefined} onClick={()=>{close(true);item.onClick?.();}}>{item.label}</button>)}
      </div>,document.body)}
    </>}
  </div>;
}

// Runs `action` after the next render, so it sees state set in the same event (e.g. save after a bulk edit).
export function useAfterRender(action){
  const latest=useRef(action);latest.current=action;
  const [pending,setPending]=useState(0);
  useEffect(()=>{if(pending)latest.current();},[pending]);
  return useCallback(()=>setPending(value=>value+1),[]);
}

// Promise-based dialog: confirm({title,message,actions:[{id,label,variant}]}) resolves with the chosen id.
export function useConfirm(){
  const [state,setState]=useState(null);
  const dialog=useRef(null),titleId=useId();
  useEffect(()=>{if(state&&!dialog.current?.open)dialog.current?.showModal();},[state]);
  const confirm=useCallback(options=>new Promise(resolve=>setState({...options,resolve})),[]);
  const finish=value=>{dialog.current?.close();state?.resolve(value);setState(null);};
  const actions=state?.actions||[{id:'cancel',label:'Vazgeç'},{id:'confirm',label:state?.confirmLabel||'Onayla',variant:state?.danger?'danger':'primary'}];
  const element=state&&typeof document!=='undefined'?createPortal(<dialog ref={dialog} className="relation-dialog confirm-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();finish('cancel');}}>
    <div className="confirm-dialog-body">
      <div className="relation-dialog-head"><span className="eyebrow">{state.eyebrow||'ONAY GEREKLİ'}</span><h3 id={titleId}>{state.title}</h3></div>
      {state.message&&<p className="confirm-dialog-message">{state.message}</p>}
      <div className="relation-dialog-actions">{actions.map((action,index)=><AdminButton key={action.id} variant={action.variant||'secondary'} autoFocus={index===0} onClick={()=>finish(action.id)}>{action.label}</AdminButton>)}</div>
    </div>
  </dialog>,document.body):null;
  return [element,confirm];
}
