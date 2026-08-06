import {describe,it,expect} from 'vitest';import {generatePieces,progress,PuzzleEngine,shouldSnap} from './domain.js';
describe('dominio del puzzle',()=>{
 it('genera la grilla y objetivos correctos',()=>{const p=generatePieces('facil');expect(p).toHaveLength(12);expect(p[0]).toMatchObject({row:0,col:0,targetX:150,targetY:105});expect(new Set(p.map(x=>`${x.x}-${x.y}`)).size).toBe(12)});
 it('detecta encaje cercano y rechaza uno lejano',()=>{const p=generatePieces('facil')[0];expect(shouldSnap(p,p.targetX+10,p.targetY+10)).toBe(true);expect(shouldSnap(p,p.targetX+200,p.targetY+200)).toBe(false)});
 it('concede un bloqueo exclusivo y luego libera',()=>{const e=new PuzzleEngine(generatePieces('facil')),id=e.pieces[0].id;expect(e.lock(id,'a')).toBe(true);expect(e.lock(id,'b')).toBe(false);expect(e.release(id,'a',400,300)?.status).toBe('free');expect(e.lock(id,'b')).toBe(true)});
 it('libera las piezas de un jugador desconectado',()=>{const e=new PuzzleEngine(generatePieces('facil'));e.lock('p0','a');expect(e.releasePlayer('a')).toHaveLength(1);expect(e.pieces[0].movedBy).toBeNull()});
 it('calcula progreso y finalización',()=>{const e=new PuzzleEngine(generatePieces('facil'));for(const p of e.pieces){e.lock(p.id,'a');e.release(p.id,'a',p.targetX,p.targetY)}expect(progress(e.pieces)).toBe(100);expect(e.complete).toBe(true)});
 it('conserva versiones para ignorar eventos antiguos',()=>{const e=new PuzzleEngine(generatePieces('facil'));e.lock('p0','a');const v=e.pieces[0].version;e.move('p0','a',100,100);expect(e.pieces[0].version).toBeGreaterThan(v)});
});
