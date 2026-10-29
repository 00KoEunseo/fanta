import { defineConfig } from 'vite';

// 깃허브 페이지(아이디.github.io/저장소이름/)처럼 하위 경로에 올려도 파일을 찾도록 상대 경로로 빌드한다
export default defineConfig({
  base: './',
});
