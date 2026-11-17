import {database} from '../storage/database';
import type {JournalEntry} from './types';
export const DRAFT_KEY='breathward-journal-draft-v1';
export interface JournalDraft {id?:string;draftId?:string;createdAt:string;title:string;text:string;feeling:string;sessionId?:string;sessionName?:string;}
export function newDraft(sessionId?:string,sessionName?:string):JournalDraft{return {draftId:crypto.randomUUID(),createdAt:new Date().toISOString(),title:'',text:'',feeling:'',sessionId,sessionName};}
export function entryDraft(e:JournalEntry):JournalDraft{return {...e,title:e.title??'',feeling:e.feeling??''};}
export function readDraft():JournalDraft|undefined{const v=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(!v||typeof v.text!=='string'||typeof v.createdAt!=='string')return;return {draftId:typeof v.draftId==='string'?v.draftId:crypto.randomUUID(),createdAt:v.createdAt,text:v.text.slice(0,30000),title:typeof v.title==='string'?v.title.slice(0,100):'',feeling:typeof v.feeling==='string'?v.feeling:'',id:typeof v.id==='string'?v.id:undefined,sessionId:typeof v.sessionId==='string'?v.sessionId:undefined,sessionName:typeof v.sessionName==='string'?v.sessionName:undefined};}
export function keepDraft(draft:JournalDraft){localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}
export function removeDraft(){localStorage.removeItem(DRAFT_KEY);}
export const journalRepository={
 list:()=>database.journal.orderBy('createdAt').reverse().toArray(),
 async save(draft:JournalDraft){if(!draft.text.trim())throw Error('Write a word or two before saving.');if(draft.text.length>30000||draft.title.length>100)throw Error('This note is too long to save.');const entry:JournalEntry={id:draft.id??draft.draftId??crypto.randomUUID(),createdAt:draft.createdAt,updatedAt:new Date().toISOString(),text:draft.text,title:draft.title.trim(),feeling:draft.feeling,sessionId:draft.sessionId,sessionName:draft.sessionName};await database.journal.put(entry);return entry;},
 delete:(id:string)=>database.journal.delete(id),
};
