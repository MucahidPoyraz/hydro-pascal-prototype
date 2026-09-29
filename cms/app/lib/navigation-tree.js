export const MAX_NAV_DEPTH=6;

// Convert historical virtual groups once; new nodes always use actual parent IDs.
export function normalizeNavigation(items=[],groups={}){
  const result=[],seen=new Set();
  items.forEach((item,index)=>{
    if(item.parentId===undefined&&['products','resources'].includes(item.parent)&&!seen.has(item.parent)){
      seen.add(item.parent);
      result.push({id:'nav-group-'+item.parent,parentId:'',label:groups[item.parent]||(item.parent==='products'?'Ürünler':'Kaynaklar'),labelEn:groups[item.parent+'En']||(item.parent==='products'?'Products':'Resources'),href:'#',active:true});
    }
    result.push({...item,id:item.id||'nav-legacy-'+index,parentId:item.parentId??(item.parent?'nav-group-'+item.parent:'')});
  });
  const counters=new Map();
  return result.map(item=>{const order=counters.get(item.parentId)||0;counters.set(item.parentId,order+1);return {...item,sortOrder:item.sortOrder??order};});
}

export function validateTree(items,maxDepth=MAX_NAV_DEPTH){
  const map=new Map();
  for(const item of items){
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>120||map.has(item.id))return 'Menü kimlikleri geçerli ve benzersiz olmalı.';
    if(typeof item.parentId!=='string'||!Number.isInteger(item.sortOrder)||item.sortOrder<0)return 'Menü konumu geçersiz.';
    map.set(item.id,item);
  }
  for(const item of items){
    const seen=new Set([item.id]);let parent=item.parentId,depth=1;
    while(parent){
      if(seen.has(parent))return 'Bir menü kendi altına taşınamaz.';
      const ancestor=map.get(parent);
      if(!ancestor)return 'Üst menü bulunamadı.';
      if(item.group&&ancestor.group!==item.group)return 'Alt menü aynı footer grubunda olmalı.';
      seen.add(parent);parent=ancestor.parentId;
      if(++depth>maxDepth)return `Menü en fazla ${maxDepth} seviye olabilir.`;
    }
  }
  return '';
}

export function childrenOf(items,parentId=''){
  return items.filter(item=>item.parentId===parentId).sort((a,b)=>a.sortOrder-b.sortOrder);
}
export function descendantsOf(items,id){
  const found=new Set();
  const visit=parent=>{for(const item of childrenOf(items,parent))if(!found.has(item.id)){found.add(item.id);visit(item.id);}};
  visit(id);return found;
}
export function depthOf(items,id){
  let depth=0,node=items.find(item=>item.id===id);
  while(node?.parentId&&depth<=items.length){depth++;node=items.find(item=>item.id===node.parentId);}
  return depth;
}
// Keyboard/button alternatives to drag and drop: nest under the previous sibling, or lift beside the parent.
export function indentNode(items,id){
  const node=items.find(item=>item.id===id);
  const siblings=childrenOf(items,node?.parentId??'');
  const index=siblings.findIndex(item=>item.id===id);
  if(index<1)throw new Error('İçeri almak için üstte aynı seviyede bir bağlantı olmalı.');
  return moveNode(items,id,siblings[index-1].id);
}
export function outdentNode(items,id){
  const node=items.find(item=>item.id===id);
  const parent=node&&items.find(item=>item.id===node.parentId);
  if(!parent)throw new Error('Bu bağlantı zaten ana seviyede.');
  const index=childrenOf(items,parent.parentId).findIndex(item=>item.id===parent.id);
  return moveNode(items,id,parent.parentId,index+1);
}
export function moveNode(items,id,parentId,index=Infinity){
  const node=items.find(item=>item.id===id);
  if(!node)throw new Error('Menü bulunamadı.');
  const siblings=childrenOf(items,parentId).filter(item=>item.id!==id);
  siblings.splice(Math.max(0,Math.min(index,siblings.length)),0,{...node,parentId});
  const replacements=new Map(siblings.map((item,sortOrder)=>[item.id,{...item,sortOrder}]));
  const next=items.map(item=>replacements.get(item.id)||item);
  const error=validateTree(next);if(error)throw new Error(error);
  return next;
}
