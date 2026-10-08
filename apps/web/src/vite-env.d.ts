/// <reference types="vite/client" />

declare module 'elkjs/lib/elk-worker.min.js?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
