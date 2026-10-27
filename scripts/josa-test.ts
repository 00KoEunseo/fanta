import { fixJosa } from '../src/data/text';
for (const s of ['바스엘와(과) 함께', '시로리스와(과) 함께', "'사제'(이)라 불릴", '모험가(이)었으나', '상인(이)었으나', '라라가(이) 왔다', '검(으)로'])
  console.log(s, '→', fixJosa(s));
