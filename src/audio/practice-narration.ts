import {HORMESIS_NARRATION} from './hormesis-narration';
export interface PracticeNarrationAsset {id:string;script:string;maxSeconds:number;assetId:string;durationSeconds:number;sha256:string;approved:true}
export const PRACTICE_NARRATION:Readonly<Record<string,PracticeNarrationAsset>>=Object.freeze({...HORMESIS_NARRATION,
  "practice.intro.box.1": {
    "id": "practice.intro.box.1",
    "maxSeconds": 24.75,
    "script": "Box breathing. Four seconds in, hold for four, four seconds out, then rest for four. Rising notes mean inhale, steady notes mean hold, and falling notes mean exhale. Keep each phase easy. You can breathe naturally whenever you prefer.",
    "assetId": "practice.intro.box.1",
    "durationSeconds": 24.25,
    "sha256": "a082525ae3738ab5ca3b283a61f2e12cd5400a7addcd232dd4a84f5a45783571",
    "approved": true
  },
  "practice.intro.478.1": {
    "id": "practice.intro.478.1",
    "maxSeconds": 24.75,
    "script": "Four-seven-eight breathing. Breathe in for four, hold comfortably for seven, and breathe out for eight. The notes rise as you inhale, stay at one pitch during the hold, and fall as you exhale. Let comfort guide you, and return to natural breathing whenever you choose.",
    "assetId": "practice.intro.478.1",
    "durationSeconds": 24.24997732426304,
    "sha256": "879e8fd0ffd1da69d63666139f16ba1c471309a92ab605968bef1756be04281a",
    "approved": true
  },
  "practice.intro.calm.1": {
    "id": "practice.intro.calm.1",
    "maxSeconds": 24.75,
    "script": "We'll use a calm breathing rhythm. Four seconds in, a gentle hold for four, six seconds out, then rest for two. Rising notes mean inhale. Steady notes mark a hold, and falling notes mean exhale. Keep it comfortable, and breathe naturally whenever you prefer.",
    "assetId": "practice.intro.calm.1",
    "durationSeconds": 24.25,
    "sha256": "41e75e5eec70fb6165c811c627b1918d52b2247dfd75643a43c11044bcd86330",
    "approved": true
  },
  "practice.intro.coherent.1": {
    "id": "practice.intro.coherent.1",
    "maxSeconds": 24.75,
    "script": "We'll use an even six-six rhythm. Six seconds in, and six seconds out. Follow the rising notes as you breathe in and the falling notes as you breathe out. There is no hold. Let the breath stay easy and unforced.",
    "assetId": "practice.intro.coherent.1",
    "durationSeconds": 20.272086167800452,
    "sha256": "c7b2722596dfeab16320674efb5b20d997ec5eb6d7794a17c481d487929bddff",
    "approved": true
  },
  "practice.intro.custom.1": {
    "id": "practice.intro.custom.1",
    "maxSeconds": 24.75,
    "script": "Your chosen breathing pattern is ready. Rising notes guide the inhale, repeated notes at one pitch mark a hold, and falling notes guide the exhale. Each note marks one second. Keep the breath comfortable. You can return to natural breathing or stop whenever you wish.",
    "assetId": "practice.intro.custom.1",
    "durationSeconds": 24.08,
    "sha256": "420b6546bb5b2468cb17c4c374d5a034e3068e20582188a9a934bbf9185e20e4",
    "approved": true
  },
  "practice.intro.hormesis.1": {
    "id": "practice.intro.hormesis.1",
    "maxSeconds": 29.75,
    "script": "For this Hormesis practice, stay seated or lying down somewhere safe. Follow the rising and falling notes for your chosen breathing rhythm. Afterward, let the breath pause only while comfortable. Release whenever you need to, and follow the recovery cues. There is no need to reach the timer's target.",
    "assetId": "practice.intro.hormesis.1",
    "durationSeconds": 26.991995464852607,
    "sha256": "840d2f24868523ddce52f29a317db71874ef2f593da6c8b9148ce4034ff00c4b",
    "approved": true
  },
  "practice.voice.round1.1": {
    "id": "practice.voice.round1.1",
    "maxSeconds": 2.75,
    "script": "Round one.",
    "assetId": "practice.voice.round1.1",
    "durationSeconds": 1.12,
    "sha256": "f1c8d8981540afd9c9021cebc7f511ef876c9b48c8e6f40a69de0cd69bc66e79",
    "approved": true
  },
  "practice.voice.round2.1": {
    "id": "practice.voice.round2.1",
    "maxSeconds": 2.75,
    "script": "Round two.",
    "assetId": "practice.voice.round2.1",
    "durationSeconds": 1.12,
    "sha256": "8ef74b93fabf2a0ca4f92982a7361fa2608dbd2cc570b0a2f0a0971111c71742",
    "approved": true
  },
  "practice.voice.finalRound.1": {
    "id": "practice.voice.finalRound.1",
    "maxSeconds": 2.75,
    "script": "Final round.",
    "assetId": "practice.voice.finalRound.1",
    "durationSeconds": 1.12,
    "sha256": "4756f92f71c5944b0f58ad925063da2ebce0bbe1f9bca8daadc077f4d6486b1f",
    "approved": true
  },
  "practice.voice.hold60.1": {
    "id": "practice.voice.hold60.1",
    "maxSeconds": 10,
    "script": "Let the breath pause. Up to sixty seconds, only while comfortable. Release whenever you choose.",
    "assetId": "practice.voice.hold60.1",
    "durationSeconds": 9.048004535147392,
    "sha256": "5c2c3f05102b3cf54043672bdcb6e8d1219e882584cf39e0d8332c426710491f",
    "approved": true
  },
  "practice.voice.hold90.1": {
    "id": "practice.voice.hold90.1",
    "maxSeconds": 10,
    "script": "Let the breath pause. Up to ninety seconds, only while comfortable. Release whenever you choose.",
    "assetId": "practice.voice.hold90.1",
    "durationSeconds": 8.839977324263039,
    "sha256": "e88b604f91796a15b90ac1be17ab09c7c1577165c5984ab47f50e32dc8b05d47",
    "approved": true
  },
  "practice.voice.fullExhale.1": {
    "id": "practice.voice.fullExhale.1",
    "maxSeconds": 3.75,
    "script": "Let the breath out.",
    "assetId": "practice.voice.fullExhale.1",
    "durationSeconds": 1.68,
    "sha256": "4a893414988d371434bbd9c92128487a891cc164751933420ac2ad4a8bbbd18a",
    "approved": true
  },
  "practice.voice.recoveryInhale.1": {
    "id": "practice.voice.recoveryInhale.1",
    "maxSeconds": 3.75,
    "script": "Take an easy breath in.",
    "assetId": "practice.voice.recoveryInhale.1",
    "durationSeconds": 2,
    "sha256": "d84a65c3335eb99016532752a0f0e0a76b5a37a78500f38e0201cc96192527ff",
    "approved": true
  },
  "practice.voice.recoveryExhale.1": {
    "id": "practice.voice.recoveryExhale.1",
    "maxSeconds": 5.75,
    "script": "Let it go, and settle.",
    "assetId": "practice.voice.recoveryExhale.1",
    "durationSeconds": 3.12,
    "sha256": "4b2608eae50ac52d9fb12599304bbd78d6565f75b4956138d69c107252e7bf7a",
    "approved": true
  },
  "practice.voice.five.1": {
    "id": "practice.voice.five.1",
    "maxSeconds": 0.95,
    "script": "Five.",
    "assetId": "practice.voice.five.1",
    "durationSeconds": 0.8,
    "sha256": "996bb0291547e85eb557c50130eae6aa725bf250ecc492768a42ac5afc06ba4a",
    "approved": true
  },
  "practice.voice.four.1": {
    "id": "practice.voice.four.1",
    "maxSeconds": 0.95,
    "script": "Four.",
    "assetId": "practice.voice.four.1",
    "durationSeconds": 0.72,
    "sha256": "5758be27a63c3d7d6673d5e60f0b42621e94701d6ab71cfa7b98f03907be0be4",
    "approved": true
  },
  "practice.voice.three.1": {
    "id": "practice.voice.three.1",
    "maxSeconds": 0.95,
    "script": "Three.",
    "assetId": "practice.voice.three.1",
    "durationSeconds": 0.64,
    "sha256": "3258fcd9a3375cc7ce9555f649eaf7c38304139977d1cffd82de7f6aaeac4bc3",
    "approved": true
  },
  "practice.voice.two.1": {
    "id": "practice.voice.two.1",
    "maxSeconds": 0.95,
    "script": "Two.",
    "assetId": "practice.voice.two.1",
    "durationSeconds": 0.64,
    "sha256": "58c0d8cac1113f4f4f9895111afcbdd284f4007bf75ab2a5ac7de237cac68c9e",
    "approved": true
  },
  "practice.voice.one.1": {
    "id": "practice.voice.one.1",
    "maxSeconds": 0.95,
    "script": "One.",
    "assetId": "practice.voice.one.1",
    "durationSeconds": 0.72,
    "sha256": "cc239d2c58a7c855348e3a185195b2204f03cae92191ca431f7fd2db22c41a7b",
    "approved": true
  }
});
