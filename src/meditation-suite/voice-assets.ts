export interface ApprovedNarrationAsset { id:string;language:'en';script:string;assetId:string;decodedDurationSeconds:number;sha256:string;approved:true }
// Content gate: review scripts, narrator, cost and generated recording before adding an entry.
// Catalog registration and PWA caching are also required; no live generation belongs in the player.
export const APPROVED_NARRATION:Readonly<Record<string,ApprovedNarrationAsset>>=Object.freeze({});
