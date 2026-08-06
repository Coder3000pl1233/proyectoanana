import {describe,it,expect} from 'vitest';import {DIFFICULTIES} from '@puzzle/shared';
describe('configuración de dificultades',()=>{it('incluye el modo experto de 100 piezas',()=>{expect(Object.values(DIFFICULTIES).map(x=>x.count)).toEqual([12,24,48,100]);expect(DIFFICULTIES.experto).toMatchObject({rows:10,cols:10,count:100})})});
