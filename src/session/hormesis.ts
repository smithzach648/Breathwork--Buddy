import type {ExerciseConfig} from './config';
export const HORMESIS_VERSION='hormesis.2';
export const HORMESIS_OPTIONS={
 two:{presetId:'hormesis-two',name:'Hormesis · Two rounds',intervalSeconds:2,cycles:30,retentions:[60,60],introId:'practice.intro.hormesis-two.1',introSeconds:90},
 foundation:{presetId:'hormesis-foundation',name:'Hormesis · Foundation',intervalSeconds:4,cycles:20,retentions:[60,60,60],introId:'practice.intro.hormesis-foundation.2',introSeconds:90},
 advanced:{presetId:'hormesis-advanced',name:'Hormesis · Advanced',intervalSeconds:2,cycles:30,retentions:[60,90,90],introId:'practice.intro.hormesis-advanced.2',introSeconds:90},
} as const;
export type HormesisOption=keyof typeof HORMESIS_OPTIONS;
export const HORMESIS_SAFETY='Practice only sitting or lying down in a safe place. Never practice standing, walking, driving, or in water. Stop for dizziness or discomfort. Retention targets are optional; release early whenever you need to.';
export function hormesisConfig(option:HormesisOption):Extract<ExerciseConfig,{kind:'hormesis'}>{const p=HORMESIS_OPTIONS[option];return {kind:'hormesis',presetId:p.presetId,protocolVersion:HORMESIS_VERSION,intervalSeconds:p.intervalSeconds,cycles:p.cycles,retentions:[...p.retentions],recoveryHoldSeconds:15};}
export function hormesisOption(config:ExerciseConfig){return config.kind==='hormesis'&&config.protocolVersion===HORMESIS_VERSION?Object.values(HORMESIS_OPTIONS).find(p=>p.presetId===config.presetId):undefined;}

export function hormesisDetails(config:ExerciseConfig){const p=hormesisOption(config);return p?{presetId:p.presetId,protocolVersion:HORMESIS_VERSION,breathsPerRound:p.cycles,intervalSeconds:p.intervalSeconds,retentionTargets:[...p.retentions]}:undefined;}
