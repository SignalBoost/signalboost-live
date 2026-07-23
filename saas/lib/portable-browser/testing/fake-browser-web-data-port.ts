import type { PortableBrowserWebDataPort } from '../browser-web-data-port.ts'
export class FakeBrowserWebDataPort implements PortableBrowserWebDataPort { async metadata(){return {title:'fake'}} async extract(){return {value:'fake'}} async search(){return ['https://example.test']} async readableContent(){return 'fake'} }
