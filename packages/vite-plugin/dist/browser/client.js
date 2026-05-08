(()=>{var Zn=Object.defineProperty;var Qn=Object.getOwnPropertyDescriptor;var v=(e,t,n,o)=>{for(var i=o>1?void 0:o?Qn(t,n):t,s=e.length-1,r;s>=0;s--)(r=e[s])&&(i=(o?r(t,n,i):r(i))||i);return o&&i&&Zn(t,n,i),i};var Ft=globalThis,qt=Ft.ShadowRoot&&(Ft.ShadyCSS===void 0||Ft.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ce=Symbol(),De=new WeakMap,Ct=class{constructor(t,n,o){if(this._$cssResult$=!0,o!==ce)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=n}get styleSheet(){let t=this.o,n=this.t;if(qt&&t===void 0){let o=n!==void 0&&n.length===1;o&&(t=De.get(n)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),o&&De.set(n,t))}return t}toString(){return this.cssText}},He=e=>new Ct(typeof e=="string"?e:e+"",void 0,ce),et=(e,...t)=>{let n=e.length===1?e[0]:t.reduce((o,i,s)=>o+(r=>{if(r._$cssResult$===!0)return r.cssText;if(typeof r=="number")return r;throw Error("Value passed to 'css' function must be a 'css' function result: "+r+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+e[s+1],e[0]);return new Ct(n,e,ce)},ze=(e,t)=>{if(qt)e.adoptedStyleSheets=t.map(n=>n instanceof CSSStyleSheet?n:n.styleSheet);else for(let n of t){let o=document.createElement("style"),i=Ft.litNonce;i!==void 0&&o.setAttribute("nonce",i),o.textContent=n.cssText,e.appendChild(o)}},de=qt?e=>e:e=>e instanceof CSSStyleSheet?(t=>{let n="";for(let o of t.cssRules)n+=o.cssText;return He(n)})(e):e;var{is:to,defineProperty:eo,getOwnPropertyDescriptor:no,getOwnPropertyNames:oo,getOwnPropertySymbols:io,getPrototypeOf:so}=Object,Kt=globalThis,Ie=Kt.trustedTypes,ro=Ie?Ie.emptyScript:"",ao=Kt.reactiveElementPolyfillSupport,Tt=(e,t)=>e,Rt={toAttribute(e,t){switch(t){case Boolean:e=e?ro:null;break;case Object:case Array:e=e==null?e:JSON.stringify(e)}return e},fromAttribute(e,t){let n=e;switch(t){case Boolean:n=e!==null;break;case Number:n=e===null?null:Number(e);break;case Object:case Array:try{n=JSON.parse(e)}catch{n=null}}return n}},Vt=(e,t)=>!to(e,t),Ue={attribute:!0,type:String,converter:Rt,reflect:!1,useDefault:!1,hasChanged:Vt};Symbol.metadata??=Symbol("metadata"),Kt.litPropertyMetadata??=new WeakMap;var j=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,n=Ue){if(n.state&&(n.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((n=Object.create(n)).wrapped=!0),this.elementProperties.set(t,n),!n.noAccessor){let o=Symbol(),i=this.getPropertyDescriptor(t,o,n);i!==void 0&&eo(this.prototype,t,i)}}static getPropertyDescriptor(t,n,o){let{get:i,set:s}=no(this.prototype,t)??{get(){return this[n]},set(r){this[n]=r}};return{get:i,set(r){let a=i?.call(this);s?.call(this,r),this.requestUpdate(t,a,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??Ue}static _$Ei(){if(this.hasOwnProperty(Tt("elementProperties")))return;let t=so(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(Tt("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(Tt("properties"))){let n=this.properties,o=[...oo(n),...io(n)];for(let i of o)this.createProperty(i,n[i])}let t=this[Symbol.metadata];if(t!==null){let n=litPropertyMetadata.get(t);if(n!==void 0)for(let[o,i]of n)this.elementProperties.set(o,i)}this._$Eh=new Map;for(let[n,o]of this.elementProperties){let i=this._$Eu(n,o);i!==void 0&&this._$Eh.set(i,n)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){let n=[];if(Array.isArray(t)){let o=new Set(t.flat(1/0).reverse());for(let i of o)n.unshift(de(i))}else t!==void 0&&n.push(de(t));return n}static _$Eu(t,n){let o=n.attribute;return o===!1?void 0:typeof o=="string"?o:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this))}addController(t){(this._$EO??=new Set).add(t),this.renderRoot!==void 0&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){let t=new Map,n=this.constructor.elementProperties;for(let o of n.keys())this.hasOwnProperty(o)&&(t.set(o,this[o]),delete this[o]);t.size>0&&(this._$Ep=t)}createRenderRoot(){let t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return ze(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.())}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.())}attributeChangedCallback(t,n,o){this._$AK(t,o)}_$ET(t,n){let o=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,o);if(i!==void 0&&o.reflect===!0){let s=(o.converter?.toAttribute!==void 0?o.converter:Rt).toAttribute(n,o.type);this._$Em=t,s==null?this.removeAttribute(i):this.setAttribute(i,s),this._$Em=null}}_$AK(t,n){let o=this.constructor,i=o._$Eh.get(t);if(i!==void 0&&this._$Em!==i){let s=o.getPropertyOptions(i),r=typeof s.converter=="function"?{fromAttribute:s.converter}:s.converter?.fromAttribute!==void 0?s.converter:Rt;this._$Em=i;let a=r.fromAttribute(n,s.type);this[i]=a??this._$Ej?.get(i)??a,this._$Em=null}}requestUpdate(t,n,o,i=!1,s){if(t!==void 0){let r=this.constructor;if(i===!1&&(s=this[t]),o??=r.getPropertyOptions(t),!((o.hasChanged??Vt)(s,n)||o.useDefault&&o.reflect&&s===this._$Ej?.get(t)&&!this.hasAttribute(r._$Eu(t,o))))return;this.C(t,n,o)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,n,{useDefault:o,reflect:i,wrapped:s},r){o&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,r??n??this[t]),s!==!0||r!==void 0)||(this._$AL.has(t)||(this.hasUpdated||o||(n=void 0),this._$AL.set(t,n)),i===!0&&this._$Em!==t&&(this._$Eq??=new Set).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(n){Promise.reject(n)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[i,s]of this._$Ep)this[i]=s;this._$Ep=void 0}let o=this.constructor.elementProperties;if(o.size>0)for(let[i,s]of o){let{wrapped:r}=s,a=this[i];r!==!0||this._$AL.has(i)||a===void 0||this.C(i,void 0,s,a)}}let t=!1,n=this._$AL;try{t=this.shouldUpdate(n),t?(this.willUpdate(n),this._$EO?.forEach(o=>o.hostUpdate?.()),this.update(n)):this._$EM()}catch(o){throw t=!1,this._$EM(),o}t&&this._$AE(n)}willUpdate(t){}_$AE(t){this._$EO?.forEach(n=>n.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&=this._$Eq.forEach(n=>this._$ET(n,this[n])),this._$EM()}updated(t){}firstUpdated(t){}};j.elementStyles=[],j.shadowRootOptions={mode:"open"},j[Tt("elementProperties")]=new Map,j[Tt("finalized")]=new Map,ao?.({ReactiveElement:j}),(Kt.reactiveElementVersions??=[]).push("2.1.2");var be=globalThis,je=e=>e,Xt=be.trustedTypes,We=Xt?Xt.createPolicy("lit-html",{createHTML:e=>e}):void 0,Xe="$lit$",Y=`lit$${Math.random().toFixed(9).slice(2)}$`,Ye="?"+Y,lo=`<${Ye}>`,it=document,kt=()=>it.createComment(""),Lt=e=>e===null||typeof e!="object"&&typeof e!="function",ve=Array.isArray,co=e=>ve(e)||typeof e?.[Symbol.iterator]=="function",pe=`[ 	
\f\r]`,Ot=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Be=/-->/g,Fe=/>/g,nt=RegExp(`>|${pe}(?:([^\\s"'>=/]+)(${pe}*=${pe}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),qe=/'/g,Ke=/"/g,Je=/^(?:script|style|textarea|title)$/i,xe=e=>(t,...n)=>({_$litType$:e,strings:t,values:n}),m=xe(1),fi=xe(2),mi=xe(3),st=Symbol.for("lit-noChange"),$=Symbol.for("lit-nothing"),Ve=new WeakMap,ot=it.createTreeWalker(it,129);function Ge(e,t){if(!ve(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return We!==void 0?We.createHTML(t):t}var po=(e,t)=>{let n=e.length-1,o=[],i,s=t===2?"<svg>":t===3?"<math>":"",r=Ot;for(let a=0;a<n;a++){let l=e[a],p,d,c=-1,h=0;for(;h<l.length&&(r.lastIndex=h,d=r.exec(l),d!==null);)h=r.lastIndex,r===Ot?d[1]==="!--"?r=Be:d[1]!==void 0?r=Fe:d[2]!==void 0?(Je.test(d[2])&&(i=RegExp("</"+d[2],"g")),r=nt):d[3]!==void 0&&(r=nt):r===nt?d[0]===">"?(r=i??Ot,c=-1):d[1]===void 0?c=-2:(c=r.lastIndex-d[2].length,p=d[1],r=d[3]===void 0?nt:d[3]==='"'?Ke:qe):r===Ke||r===qe?r=nt:r===Be||r===Fe?r=Ot:(r=nt,i=void 0);let u=r===nt&&e[a+1].startsWith("/>")?" ":"";s+=r===Ot?l+lo:c>=0?(o.push(p),l.slice(0,c)+Xe+l.slice(c)+Y+u):l+Y+(c===-2?a:u)}return[Ge(e,s+(e[n]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),o]},Mt=class e{constructor({strings:t,_$litType$:n},o){let i;this.parts=[];let s=0,r=0,a=t.length-1,l=this.parts,[p,d]=po(t,n);if(this.el=e.createElement(p,o),ot.currentNode=this.el.content,n===2||n===3){let c=this.el.content.firstChild;c.replaceWith(...c.childNodes)}for(;(i=ot.nextNode())!==null&&l.length<a;){if(i.nodeType===1){if(i.hasAttributes())for(let c of i.getAttributeNames())if(c.endsWith(Xe)){let h=d[r++],u=i.getAttribute(c).split(Y),f=/([.?@])?(.*)/.exec(h);l.push({type:1,index:s,name:f[2],strings:u,ctor:f[1]==="."?he:f[1]==="?"?fe:f[1]==="@"?me:mt}),i.removeAttribute(c)}else c.startsWith(Y)&&(l.push({type:6,index:s}),i.removeAttribute(c));if(Je.test(i.tagName)){let c=i.textContent.split(Y),h=c.length-1;if(h>0){i.textContent=Xt?Xt.emptyScript:"";for(let u=0;u<h;u++)i.append(c[u],kt()),ot.nextNode(),l.push({type:2,index:++s});i.append(c[h],kt())}}}else if(i.nodeType===8)if(i.data===Ye)l.push({type:2,index:s});else{let c=-1;for(;(c=i.data.indexOf(Y,c+1))!==-1;)l.push({type:7,index:s}),c+=Y.length-1}s++}}static createElement(t,n){let o=it.createElement("template");return o.innerHTML=t,o}};function ft(e,t,n=e,o){if(t===st)return t;let i=o!==void 0?n._$Co?.[o]:n._$Cl,s=Lt(t)?void 0:t._$litDirective$;return i?.constructor!==s&&(i?._$AO?.(!1),s===void 0?i=void 0:(i=new s(e),i._$AT(e,n,o)),o!==void 0?(n._$Co??=[])[o]=i:n._$Cl=i),i!==void 0&&(t=ft(e,i._$AS(e,t.values),i,o)),t}var ue=class{constructor(t,n){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=n}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){let{el:{content:n},parts:o}=this._$AD,i=(t?.creationScope??it).importNode(n,!0);ot.currentNode=i;let s=ot.nextNode(),r=0,a=0,l=o[0];for(;l!==void 0;){if(r===l.index){let p;l.type===2?p=new Pt(s,s.nextSibling,this,t):l.type===1?p=new l.ctor(s,l.name,l.strings,this,t):l.type===6&&(p=new ge(s,this,t)),this._$AV.push(p),l=o[++a]}r!==l?.index&&(s=ot.nextNode(),r++)}return ot.currentNode=it,i}p(t){let n=0;for(let o of this._$AV)o!==void 0&&(o.strings!==void 0?(o._$AI(t,o,n),n+=o.strings.length-2):o._$AI(t[n])),n++}},Pt=class e{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,n,o,i){this.type=2,this._$AH=$,this._$AN=void 0,this._$AA=t,this._$AB=n,this._$AM=o,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode,n=this._$AM;return n!==void 0&&t?.nodeType===11&&(t=n.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,n=this){t=ft(this,t,n),Lt(t)?t===$||t==null||t===""?(this._$AH!==$&&this._$AR(),this._$AH=$):t!==this._$AH&&t!==st&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):co(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==$&&Lt(this._$AH)?this._$AA.nextSibling.data=t:this.T(it.createTextNode(t)),this._$AH=t}$(t){let{values:n,_$litType$:o}=t,i=typeof o=="number"?this._$AC(t):(o.el===void 0&&(o.el=Mt.createElement(Ge(o.h,o.h[0]),this.options)),o);if(this._$AH?._$AD===i)this._$AH.p(n);else{let s=new ue(i,this),r=s.u(this.options);s.p(n),this.T(r),this._$AH=s}}_$AC(t){let n=Ve.get(t.strings);return n===void 0&&Ve.set(t.strings,n=new Mt(t)),n}k(t){ve(this._$AH)||(this._$AH=[],this._$AR());let n=this._$AH,o,i=0;for(let s of t)i===n.length?n.push(o=new e(this.O(kt()),this.O(kt()),this,this.options)):o=n[i],o._$AI(s),i++;i<n.length&&(this._$AR(o&&o._$AB.nextSibling,i),n.length=i)}_$AR(t=this._$AA.nextSibling,n){for(this._$AP?.(!1,!0,n);t!==this._$AB;){let o=je(t).nextSibling;je(t).remove(),t=o}}setConnected(t){this._$AM===void 0&&(this._$Cv=t,this._$AP?.(t))}},mt=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,n,o,i,s){this.type=1,this._$AH=$,this._$AN=void 0,this.element=t,this.name=n,this._$AM=i,this.options=s,o.length>2||o[0]!==""||o[1]!==""?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=$}_$AI(t,n=this,o,i){let s=this.strings,r=!1;if(s===void 0)t=ft(this,t,n,0),r=!Lt(t)||t!==this._$AH&&t!==st,r&&(this._$AH=t);else{let a=t,l,p;for(t=s[0],l=0;l<s.length-1;l++)p=ft(this,a[o+l],n,l),p===st&&(p=this._$AH[l]),r||=!Lt(p)||p!==this._$AH[l],p===$?t=$:t!==$&&(t+=(p??"")+s[l+1]),this._$AH[l]=p}r&&!i&&this.j(t)}j(t){t===$?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},he=class extends mt{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===$?void 0:t}},fe=class extends mt{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==$)}},me=class extends mt{constructor(t,n,o,i,s){super(t,n,o,i,s),this.type=5}_$AI(t,n=this){if((t=ft(this,t,n,0)??$)===st)return;let o=this._$AH,i=t===$&&o!==$||t.capture!==o.capture||t.once!==o.once||t.passive!==o.passive,s=t!==$&&(o===$||i);i&&this.element.removeEventListener(this.name,this,o),s&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}},ge=class{constructor(t,n,o){this.element=t,this.type=6,this._$AN=void 0,this._$AM=n,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(t){ft(this,t)}};var uo=be.litHtmlPolyfillSupport;uo?.(Mt,Pt),(be.litHtmlVersions??=[]).push("3.3.2");var Ze=(e,t,n)=>{let o=n?.renderBefore??t,i=o._$litPart$;if(i===void 0){let s=n?.renderBefore??null;o._$litPart$=i=new Pt(t.insertBefore(kt(),s),s,void 0,n??{})}return i._$AI(e),i};var ye=globalThis,R=class extends j{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){let n=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=Ze(n,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return st}};R._$litElement$=!0,R.finalized=!0,ye.litElementHydrateSupport?.({LitElement:R});var ho=ye.litElementPolyfillSupport;ho?.({LitElement:R});(ye.litElementVersions??=[]).push("4.2.2");var gt=e=>(t,n)=>{n!==void 0?n.addInitializer(()=>{customElements.define(e,t)}):customElements.define(e,t)};var fo={attribute:!0,type:String,converter:Rt,reflect:!1,hasChanged:Vt},mo=(e=fo,t,n)=>{let{kind:o,metadata:i}=n,s=globalThis.litPropertyMetadata.get(i);if(s===void 0&&globalThis.litPropertyMetadata.set(i,s=new Map),o==="setter"&&((e=Object.create(e)).wrapped=!0),s.set(n.name,e),o==="accessor"){let{name:r}=n;return{set(a){let l=t.get.call(this);t.set.call(this,a),this.requestUpdate(r,l,e,!0,a)},init(a){return a!==void 0&&this.C(r,void 0,e,a),a}}}if(o==="setter"){let{name:r}=n;return function(a){let l=this[r];t.call(this,a),this.requestUpdate(r,l,e,!0,a)}}throw Error("Unsupported decorator location: "+o)};function rt(e){return(t,n)=>typeof n=="object"?mo(e,t,n):((o,i,s)=>{let r=i.hasOwnProperty(s);return i.constructor.createProperty(s,o),r?Object.getOwnPropertyDescriptor(i,s):void 0})(e,t,n)}function A(e){return rt({...e,state:!0,attribute:!1})}var go="/design-bridge";var J=null,Nt=500,we=new Set;function Qe(){let e=window.__DB_WS_URL__??`ws://${location.host}${go}`;J=new WebSocket(e),J.addEventListener("open",()=>{Nt=500,console.debug("[design-bridge] WebSocket connected")}),J.addEventListener("message",t=>{let n;try{n=JSON.parse(t.data)}catch{return}for(let o of we)o(n)}),J.addEventListener("close",()=>{console.debug(`[design-bridge] WS closed \u2013 reconnecting in ${Nt}ms`),setTimeout(()=>{Nt=Math.min(Nt*2,1e4),Qe()},Nt)}),J.addEventListener("error",()=>{J?.close()})}function W(e){J?.readyState===WebSocket.OPEN&&J.send(JSON.stringify(e))}function Jt(e){return we.add(e),()=>we.delete(e)}Qe();var bo=new Set(["role","name","aria-label","rel","href"]);function vo(e,t){let n=bo.has(e);n||=e.startsWith("data-")&&Dt(e);let o=Dt(t)&&t.length<100;return o||=t.startsWith("#")&&Dt(t.slice(1)),n&&o}function xo(e){return Dt(e)}function yo(e){return Dt(e)}function wo(e){return!0}function Gt(e,t){if(e.nodeType!==Node.ELEMENT_NODE)throw new Error("Can't generate CSS selector for non-element node type.");if(e.tagName.toLowerCase()==="html")return"html";let n={root:document.body,idName:xo,className:yo,tagName:wo,attr:vo,timeoutMs:1e3,seedMinLength:3,optimizedMinLength:2,maxNumberOfPathChecks:1/0},o=new Date,i={...n,...t},s=So(i.root,n),r,a=0;for(let p of _o(e,i,s)){if(new Date().getTime()-o.getTime()>i.timeoutMs||a>=i.maxNumberOfPathChecks){let c=Ao(e,s);if(!c)throw new Error(`Timeout: Can't find a unique selector after ${i.timeoutMs}ms`);return Ht(c)}if(a++,Ae(p,s)){r=p;break}}if(!r)throw new Error("Selector was not found.");let l=[...on(r,e,i,s,o)];return l.sort(_e),l.length>0?Ht(l[0]):Ht(r)}function*_o(e,t,n){let o=[],i=[],s=e,r=0;for(;s&&s!==n;){let a=$o(s,t);for(let l of a)l.level=r;if(o.push(a),s=s.parentElement,r++,i.push(...nn(o)),r>=t.seedMinLength){i.sort(_e);for(let l of i)yield l;i=[]}}i.sort(_e);for(let a of i)yield a}function Dt(e){if(/^[a-z\-]{3,}$/i.test(e)){let t=e.split(/-|[A-Z]/);for(let n of t)if(n.length<=2||/[^aeiou]{4,}/i.test(n))return!1;return!0}return!1}function $o(e,t){let n=[],o=e.getAttribute("id");o&&t.idName(o)&&n.push({name:"#"+CSS.escape(o),penalty:0});for(let r=0;r<e.classList.length;r++){let a=e.classList[r];t.className(a)&&n.push({name:"."+CSS.escape(a),penalty:1})}for(let r=0;r<e.attributes.length;r++){let a=e.attributes[r];t.attr(a.name,a.value)&&n.push({name:`[${CSS.escape(a.name)}="${CSS.escape(a.value)}"]`,penalty:2})}let i=e.tagName.toLowerCase();if(t.tagName(i)){n.push({name:i,penalty:5});let r=$e(e,i);r!==void 0&&n.push({name:en(i,r),penalty:10})}let s=$e(e);return s!==void 0&&n.push({name:Eo(i,s),penalty:50}),n}function Ht(e){let t=e[0],n=t.name;for(let o=1;o<e.length;o++){let i=e[o].level||0;t.level===i-1?n=`${e[o].name} > ${n}`:n=`${e[o].name} ${n}`,t=e[o]}return n}function tn(e){return e.map(t=>t.penalty).reduce((t,n)=>t+n,0)}function _e(e,t){return tn(e)-tn(t)}function $e(e,t){let n=e.parentNode;if(!n)return;let o=n.firstChild;if(!o)return;let i=0;for(;o&&(o.nodeType===Node.ELEMENT_NODE&&(t===void 0||o.tagName.toLowerCase()===t)&&i++,o!==e);)o=o.nextSibling;return i}function Ao(e,t){let n=0,o=e,i=[];for(;o&&o!==t;){let s=o.tagName.toLowerCase(),r=$e(o,s);if(r===void 0)return;i.push({name:en(s,r),penalty:NaN,level:n}),o=o.parentElement,n++}if(Ae(i,t))return i}function Eo(e,t){return e==="html"?"html":`${e}:nth-child(${t})`}function en(e,t){return e==="html"?"html":`${e}:nth-of-type(${t})`}function*nn(e,t=[]){if(e.length>0)for(let n of e[0])yield*nn(e.slice(1,e.length),t.concat(n));else yield t}function So(e,t){return e.nodeType===Node.DOCUMENT_NODE?e:e===t.root?e.ownerDocument:e}function Ae(e,t){let n=Ht(e);switch(t.querySelectorAll(n).length){case 0:throw new Error(`Can't select any node with this selector: ${n}`);case 1:return!0;default:return!1}}function*on(e,t,n,o,i){if(e.length>2&&e.length>n.optimizedMinLength)for(let s=1;s<e.length-1;s++){if(new Date().getTime()-i.getTime()>n.timeoutMs)return;let a=[...e];a.splice(s,1),Ae(a,o)&&o.querySelector(Ht(a))===t&&(yield a,yield*on(a,t,n,o,i))}}function Co(e){try{return Gt(e)}catch{return e.tagName.toLowerCase()}}var N=new Map,Ee=new Set,Zt=new BroadcastChannel("design-bridge:annotations");function Qt(){for(let e of Ee)e()}function Se(){return[...N.values()]}function sn(e){return Ee.add(e),()=>Ee.delete(e)}function rn(e){N.clear();for(let t of e)N.set(t.id,t);at(),Qt()}function an(e){N.set(e.id,e),W({type:"annotation:upsert",payload:e}),Zt.postMessage({type:"annotations:sync",payload:[...N.values()]}),at(),Qt()}function Ce(e){N.delete(e),W({type:"annotation:delete",payload:{id:e}}),Zt.postMessage({type:"annotations:sync",payload:[...N.values()]}),at(),Qt()}function ln(){N.clear(),W({type:"annotation:clear"}),Zt.postMessage({type:"annotations:sync",payload:[]}),at(),Qt()}var lt=!1,F=null;function Te(){return lt}function zt(e){lt=e,document.body.style.cursor=e?"crosshair":"",!e&&F&&(F.classList.remove("db-inspect-highlight"),F=null)}function To(e){return!!e.closest("bridge-panel, bridge-annotation-popover, bridge-annotation-badge")}function Ro(e){if(!lt)return;let t=e.target;To(t)||(F&&F.classList.remove("db-inspect-highlight"),F=t,F.classList.add("db-inspect-highlight"))}function Oo(e){if(!lt)return;let t=e.target;t.classList.remove("db-inspect-highlight"),F===t&&(F=null)}function ko(e){if(!lt||e.target.closest("bridge-panel, bridge-annotation-popover, bridge-annotation-badge"))return;e.preventDefault(),e.stopPropagation();let t=e.target;t.classList.remove("db-inspect-highlight");let n=document.querySelector("bridge-annotation-popover");if(!n)return;let o=Co(t),i=[...N.values()].find(s=>s.selectors.includes(o));i?n.showForAnnotation(i):n.showForElement(t)}var B=null;function at(){if(!B)return;B.innerHTML="",[...N.values()].forEach((t,n)=>{let o=document.createElement("bridge-annotation-badge");o.annotation=t,o.index=n,B.appendChild(o)})}Zt.addEventListener("message",e=>{let{type:t,payload:n}=e.data;t==="annotations:sync"&&rn(n)});Jt(e=>{e.type==="annotations:sync"?rn(e.payload):e.type==="inspect:pick"&&document.querySelector("bridge-annotation-popover")?.showForSource(e.payload)});function Lo(){if(document.getElementById("db-inspect-style"))return;let e=document.createElement("style");e.id="db-inspect-style",e.textContent=".db-inspect-highlight{outline:2px solid #f59e0b!important;outline-offset:2px!important;cursor:crosshair!important;}",document.head.appendChild(e)}function cn(){Lo(),B=document.createElement("div"),B.id="db-badges",B.style.cssText="position:fixed;top:0;left:0;pointer-events:none;z-index:2147483645;width:0;height:0;",document.body.appendChild(B),document.addEventListener("mouseover",Ro,{capture:!0}),document.addEventListener("mouseout",Oo,{capture:!0}),document.addEventListener("click",ko,{capture:!0}),document.addEventListener("keydown",n=>{if(n.altKey&&n.key==="i"){n.preventDefault(),zt(!lt);return}if(n.key==="Escape"){let o=document.querySelector("bridge-annotation-popover");if(o&&!o.hidden){o.hidden=!0;return}lt&&zt(!1)}});let e=null;new MutationObserver(n=>{n.every(o=>B.contains(o.target)||o.target===B)||(e&&clearTimeout(e),e=setTimeout(at,150))}).observe(document.body,{childList:!0,subtree:!0}),window.addEventListener("scroll",at,{passive:!0}),window.addEventListener("resize",at,{passive:!0})}function Mo(e,t){let n=`knob-${e.marker}`,o;if(e.type==="select"&&e.options){let i=Object.entries(e.options);o=m`
      <select
        id=${n}
        class="db-control db-select"
        .value=${String(e.value)}
        @change=${s=>t(e.marker,s.target.value)}
      >
        ${i.map(([s,r])=>m`
          <option value=${r} ?selected=${r===String(e.value)}>${s}</option>
        `)}
      </select>
    `}else e.type==="boolean"?o=m`
      <label class="db-toggle">
        <input
          type="checkbox"
          .checked=${!!e.value}
          @change=${i=>t(e.marker,String(i.target.checked))}
        />
        <span class="db-toggle-track"></span>
      </label>
    `:e.type==="number"?o=m`
      <input
        id=${n}
        type="number"
        class="db-control db-input"
        .value=${String(e.value)}
        min=${e.min??""}
        max=${e.max??""}
        step=${e.step??""}
        @change=${i=>t(e.marker,i.target.value)}
      />
    `:e.type==="color"?o=m`
      <input
        id=${n}
        type="color"
        class="db-control db-color"
        .value=${String(e.value)}
        @input=${i=>t(e.marker,i.target.value)}
      />
    `:o=m`
      <input
        id=${n}
        type="text"
        class="db-control db-input"
        .value=${String(e.value)}
        @change=${i=>t(e.marker,i.target.value)}
      />
    `;return m`
    <div class="db-row">
      <label class="db-label" for=${n}>${e.label}</label>
      <div class="db-control-wrap">${o}</div>
    </div>
  `}function dn(e,t){return e.length===0?m``:m`
    <div class="db-knobs">
      ${e.map(n=>Mo(n,t))}
    </div>
    <div class="db-separator"></div>
  `}function pn(e,t){return e?m`
    <div class="db-actions">
      <button class="db-btn db-btn--ghost" @click=${t.onRevert}>Revert</button>
      <button class="db-btn db-btn--danger" @click=${t.onDiscard}>Discard &amp; Exit</button>
      <button class="db-btn db-btn--primary" @click=${t.onApply}>Apply &amp; Exit</button>
    </div>
  `:m``}var un="data-db-related";function Po(e){for(let t of e.selectors)try{document.querySelector(t)?.setAttribute(un,"true")}catch{}}function No(e){for(let t of e.selectors)try{document.querySelector(t)?.removeAttribute(un)}catch{}}function Do(e,t,n){let o=e.labels[0]??"?",i=e.labels.length-1;return m`
    <div class="db-ann-row"
      @click=${s=>n.onEdit(e,s.currentTarget)}
      @mouseenter=${()=>Po(e)}
      @mouseleave=${()=>No(e)}>
      <div class="db-ann-meta">
        <div class="db-ann-targets">
          <span class="db-ann-index">${t+1}.</span>
          <span class="db-ann-label">${o}</span>
          ${i>0?m`<span class="db-ann-extra">+${i}</span>`:""}
        </div>
        ${e.comment?m`
          <div class="db-ann-comment" title=${e.comment}>${e.comment}</div>
        `:""}
      </div>
      <button class="db-icon-btn db-icon-btn--del" title="Delete"
        @click=${s=>{s.stopPropagation(),n.onDelete(e.id)}}>×</button>
    </div>
  `}function hn(e,t){return m`
    <div class="db-annotate">
      ${e.length===0?m`<div class="db-empty">No annotations yet — switch to the Annotations tab and click any element</div>`:m`
          <div class="db-ann-list">
            ${e.map((n,o)=>Do(n,o,t))}
          </div>
          <div class="db-separator"></div>
          <button class="db-btn db-btn--danger db-btn--full" @click=${t.onClear}>× Clear all</button>
        `}
    </div>
  `}var fn="__design_bridge_panel__";function Re(){try{return JSON.parse(localStorage.getItem(fn)??"{}")}catch{return{}}}function bt(e){try{let t=Re();localStorage.setItem(fn,JSON.stringify({...t,...e}))}catch{}}var Ho=et`
  :host {
    --db-bg: #1e1e2e;
    --db-surface: #313244;
    --db-border: #45475a;
    --db-text: #cdd6f4;
    --db-muted: #6c7086;
    --db-amber: #f59e0b;
    --db-amber-dim: rgba(245,158,11,.12);
    --db-red: #f38ba8;
    --db-subtext: #a6adc8;
    --db-font-mono: ui-monospace, monospace;
    --db-radius: 4px;
    --db-panel-radius: 8px;

    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 2147483647;
    width: 300px;
    height: 420px;
    min-width: 220px;
    min-height: 200px;
    resize: both;
    overflow: hidden;
    font-family: var(--db-font-mono);
    font-size: 12px;
  }

  :host([data-collapsed]) {
    height: auto !important;
    min-height: 0 !important;
    resize: none !important;
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--db-bg);
    color: var(--db-text);
    border: 1px solid rgba(245,158,11,.35);
    border-radius: var(--db-panel-radius);
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(245,158,11,.08);
  }

  .panel-title {
    background: var(--db-surface);
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--db-text);
    border-bottom: 1px solid var(--db-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .panel-title:active { cursor: grabbing; }
  .panel-snap-btns {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .panel-snap-btn {
    all: unset;
    cursor: pointer;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--db-muted);
    line-height: 1;
  }
  .panel-snap-btn:hover { background: var(--db-border); color: var(--db-text); }

  .db-separator {
    border: none;
    border-top: 1px solid var(--db-border);
    margin: 4px 0;
  }

  .db-section {
    padding: 6px 8px;
  }

  .db-section-header {
    padding: 4px 4px 2px;
  }
  .db-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--db-muted);
  }

  /* Rows */
  .db-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
  }
  .db-label {
    flex: 1;
    font-size: 11px;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Controls */
  .db-control-wrap {
    flex-shrink: 0;
    min-width: 100px;
    max-width: 120px;
  }
  .db-control {
    width: 100%;
    box-sizing: border-box;
    background: var(--db-surface);
    color: var(--db-text);
    border: 1px solid var(--db-border);
    border-radius: var(--db-radius);
    padding: 3px 6px;
    font: inherit;
    font-size: 11px;
    outline: none;
  }
  .db-control:focus { border-color: var(--db-amber); }
  .db-select { cursor: pointer; }
  .db-color { padding: 2px; height: 24px; cursor: pointer; }
  .db-input { }

  /* Toggle */
  .db-toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    flex-shrink: 0;
  }
  .db-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
  .db-toggle-track {
    width: 32px;
    height: 16px;
    border-radius: 8px;
    background: var(--db-border);
    transition: background .15s;
    position: relative;
  }
  .db-toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--db-text);
    transition: transform .15s;
  }
  .db-toggle input:checked ~ .db-toggle-track { background: var(--db-amber); }
  .db-toggle input:checked ~ .db-toggle-track::after { transform: translateX(16px); }

  /* Buttons */
  .db-actions { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; }
  .db-btn {
    padding: 5px 8px;
    border-radius: var(--db-radius);
    border: 1px solid transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }
  .db-btn--primary { background: var(--db-amber); color: var(--db-bg); }
  .db-btn--danger { background: transparent; color: var(--db-red); border-color: var(--db-border); }
  .db-btn--ghost { background: var(--db-surface); color: var(--db-text); }
  .db-btn--full { width: 100%; box-sizing: border-box; display: block; margin-top: 4px; }

  /* Annotation list */
  .db-ann-list { display: flex; flex-direction: column; }
  .db-ann-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px;
    border-radius: var(--db-radius);
    cursor: pointer;
  }
  .db-ann-row:hover { background: rgba(245,158,11,.08); }
  .db-ann-meta { flex: 1; min-width: 0; }
  .db-ann-targets {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--db-amber);
    font-size: 11px;
  }
  .db-ann-index { color: var(--db-muted); font-size: 10px; }
  .db-ann-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .db-ann-extra { color: var(--db-muted); font-size: 10px; }
  .db-ann-comment {
    color: var(--db-subtext);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    margin-top: 1px;
  }
  .db-icon-btn {
    all: unset;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    flex-shrink: 0;
  }
  .db-icon-btn--del { color: var(--db-muted); font-size: 14px; line-height: 1; }
  .db-icon-btn--del:hover { color: var(--db-red); }
  .db-icon-btn:hover { background: var(--db-surface); }
  .db-empty { font-size: 11px; color: var(--db-muted); padding: 6px 4px; font-style: italic; }

  /* Tabs */
  .db-tabs {
    display: flex;
    border-bottom: 1px solid var(--db-border);
    background: var(--db-surface);
  }
  .db-tab {
    flex: 1;
    padding: 6px 8px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--db-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    letter-spacing: .04em;
    text-transform: uppercase;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color .1s, border-color .1s;
  }
  .db-tab:hover { color: var(--db-text); }
  .db-tab[aria-selected="true"] {
    color: var(--db-text);
    border-bottom-color: var(--db-amber);
  }
  .db-tab-badge {
    display: inline-block;
    background: var(--db-amber);
    color: var(--db-bg);
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .db-tabs { flex-shrink: 0; }
  .db-tab-content {
    padding: 6px 8px;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
`,D=class extends R{constructor(){super(...arguments);this._knobs=[];this._annotations=[];this._inspectActive=!1;this._activeTab="tweaks";this._collapsed=!1;this._unsubAnnotations=null;this._resizeObserver=null;this._saveResizeTimer=null;this._syncInspect=()=>{let n=Te();this._inspectActive!==n&&(this._inspectActive=n)};this._onKnobChange=(n,o)=>{W({type:"tweak:change",payload:{marker:n,value:o}})};this._onRevert=()=>{W({type:"tweak:reset-all"})};this._onDiscard=()=>{W({type:"tweak:discard-all"}),this._knobs=[]};this._onApply=()=>{W({type:"tweak:finalize",payload:{markers:this._knobs.map(n=>n.marker)}}),this._knobs=[]};this._onInspectToggle=n=>{zt(n),this._inspectActive=n};this._onAnnotationSave=n=>{an(n.detail)};this._onAnnotationDelete=n=>{Ce(n.detail.id)};this._onAnnotationOpen=n=>{document.querySelector("bridge-annotation-popover")?.showForAnnotation(n.detail.annotation,n.detail.rect)};this._onDragStart=n=>{if(n.target.closest("button")||n.detail>=2)return;n.preventDefault();let o=this;o.style.transform="",o.style.setProperty("--db-panel-radius","8px"),o.style.resize="both",o.style.height=o.style.height||"420px",o.removeAttribute("data-collapsed"),this._collapsed=!1;let i=n.clientX,s=n.clientY,r=o.getBoundingClientRect();o.style.bottom="auto",o.style.right="auto",o.style.top=`${r.top}px`,o.style.left=`${r.left}px`;let a=p=>{let c=r.top+p.clientY-s,h=r.left+p.clientX-i,u=o.offsetWidth,f=Math.max(0,Math.min(c,window.innerHeight-36)),g=Math.max(0,Math.min(h,window.innerWidth-u));o.style.top=`${f}px`,o.style.left=`${g}px`},l=()=>{document.removeEventListener("mousemove",a),document.removeEventListener("mouseup",l);let p=o.getBoundingClientRect();bt({top:p.top,left:p.left,snap:null,collapsed:!1})};document.addEventListener("mousemove",a),document.addEventListener("mouseup",l)};this._onTitleDblClick=n=>{if(n.target.closest("button"))return;n.preventDefault(),this._collapsed=!this._collapsed;let o=this;if(this._collapsed)o.setAttribute("data-collapsed","");else{o.removeAttribute("data-collapsed");let i=Re();i.snap||(o.style.height=`${i.height??420}px`)}bt({collapsed:this._collapsed})}}connectedCallback(){super.connectedCallback();let n=Re(),o=this;n.top!==void 0&&(o.style.top=`${n.top}px`,o.style.bottom="auto"),n.left!==void 0&&(o.style.left=`${n.left}px`,o.style.right="auto"),n.width!==void 0&&(o.style.width=`${n.width}px`),n.height!==void 0&&(o.style.height=`${n.height}px`),n.snap?this._applySnap(n.snap,!1):n.collapsed&&(this._collapsed=!0,this.setAttribute("data-collapsed","")),n.activeTab&&(this._activeTab=n.activeTab),this._annotations=Se(),this._unsubAnnotations=sn(()=>{this._annotations=Se(),this._inspectActive=Te()}),Jt(i=>{i.type==="tweak:schema"&&(this._knobs=i.payload),i.type==="annotations:sync"&&(this._annotations=i.payload),i.type==="inspect:pick"&&(document.querySelector("bridge-annotation-popover")?.showForSource(i.payload),this._activeTab="annotations",bt({activeTab:"annotations"}))}),document.addEventListener("annotation-save",this._onAnnotationSave),document.addEventListener("annotation-delete",this._onAnnotationDelete),document.addEventListener("annotation-open",this._onAnnotationOpen),document.addEventListener("keydown",this._syncInspect),this._resizeObserver=new ResizeObserver(()=>{this._collapsed||(this._saveResizeTimer&&clearTimeout(this._saveResizeTimer),this._saveResizeTimer=setTimeout(()=>{let i=o.getBoundingClientRect();bt({width:i.width,height:i.height})},300))}),this._resizeObserver.observe(o)}disconnectedCallback(){super.disconnectedCallback(),this._unsubAnnotations?.(),this._resizeObserver?.disconnect(),this._saveResizeTimer&&clearTimeout(this._saveResizeTimer),document.removeEventListener("annotation-save",this._onAnnotationSave),document.removeEventListener("annotation-delete",this._onAnnotationDelete),document.removeEventListener("annotation-open",this._onAnnotationOpen),document.removeEventListener("keydown",this._syncInspect)}_getPopover(){return document.querySelector("bridge-annotation-popover")}_applySnap(n,o=!0){let i=this;switch(i.style.cssText="",i.removeAttribute("data-collapsed"),this._collapsed=!1,n){case"left":Object.assign(i.style,{top:"0",left:"0",bottom:"0",right:"auto",width:"280px",height:"100dvh",resize:"horizontal"}),i.style.setProperty("--db-panel-radius","0 8px 8px 0");break;case"right":Object.assign(i.style,{top:"0",right:"0",bottom:"0",left:"auto",width:"280px",height:"100dvh",resize:"horizontal"}),i.style.setProperty("--db-panel-radius","8px 0 0 8px");break;case"top":Object.assign(i.style,{top:"0",left:"50%",transform:"translateX(-50%)",bottom:"auto",right:"auto",width:"240px",height:"auto",minHeight:"0",resize:"none"}),i.style.setProperty("--db-panel-radius","0 0 8px 8px"),this._collapsed=!0,i.setAttribute("data-collapsed","");break;case"bottom":Object.assign(i.style,{bottom:"0",left:"50%",transform:"translateX(-50%)",top:"auto",right:"auto",width:"240px",height:"auto",minHeight:"0",resize:"none"}),i.style.setProperty("--db-panel-radius","8px 8px 0 0"),this._collapsed=!0,i.setAttribute("data-collapsed","");break}o&&bt({snap:n,collapsed:this._collapsed})}_setTab(n){this._activeTab=n,zt(n==="annotations"),this._inspectActive=n==="annotations",bt({activeTab:n})}render(){let n=this._knobs.length>0,o=this._annotations.length;return m`
      <div class="panel">
        <div class="panel-title" @mousedown=${this._onDragStart} @dblclick=${this._onTitleDblClick}>
          <span>Design Bridge</span>
          <div class="panel-snap-btns">
            <button class="panel-snap-btn" title="Snap to top" @click=${i=>{i.stopPropagation(),this._applySnap("top")}}>&#9650;</button>
            <button class="panel-snap-btn" title="Snap left" @click=${i=>{i.stopPropagation(),this._applySnap("left")}}>&#9664;</button>
            <button class="panel-snap-btn" title="Snap right" @click=${i=>{i.stopPropagation(),this._applySnap("right")}}>&#9654;</button>
            <button class="panel-snap-btn" title="Snap to bottom" @click=${i=>{i.stopPropagation(),this._applySnap("bottom")}}>&#9660;</button>
          </div>
        </div>

        ${this._collapsed?"":m`
          <div class="db-tabs" role="tablist">
            <button
              class="db-tab"
              role="tab"
              aria-selected=${this._activeTab==="tweaks"}
              @click=${()=>this._setTab("tweaks")}
            >Tweaks${n?m`<span class="db-tab-badge">${this._knobs.length}</span>`:""}</button>
            <button
              class="db-tab"
              role="tab"
              aria-selected=${this._activeTab==="annotations"}
              @click=${()=>this._setTab("annotations")}
            >Annotations${o>0?m`<span class="db-tab-badge">${o}</span>`:""}</button>
          </div>
          <div class="db-tab-content">
            ${this._activeTab==="tweaks"?m`
              ${dn(this._knobs,this._onKnobChange)}
              ${pn(n,{onRevert:this._onRevert,onDiscard:this._onDiscard,onApply:this._onApply})}
              ${n?"":m`<div class="db-empty">No tweaks active — drop a .mjs script into tweaks/scripts/</div>`}
            `:hn(this._annotations,{onEdit:(i,s)=>this._getPopover()?.showForAnnotation(i,s),onDelete:i=>Ce(i),onClear:()=>ln()})}
          </div>
        `}
      </div>
    `}};D.styles=Ho,v([A()],D.prototype,"_knobs",2),v([A()],D.prototype,"_annotations",2),v([A()],D.prototype,"_inspectActive",2),v([A()],D.prototype,"_activeTab",2),v([A()],D.prototype,"_collapsed",2),D=v([gt("bridge-panel")],D);var te="data-db-related",q=class extends R{constructor(){super(...arguments);this.index=0;this._top=-9999;this._left=-9999;this._resizeObserver=null;this._reposition=()=>{for(let n of this.annotation.selectors)try{let o=document.querySelector(n);if(!o)continue;let i=o.getBoundingClientRect();this._top=i.top-10,this._left=i.right-8;return}catch{}this._top=-9999,this._left=-9999}}connectedCallback(){super.connectedCallback(),this._reposition(),window.addEventListener("scroll",this._reposition,{passive:!0,capture:!0}),window.addEventListener("resize",this._reposition,{passive:!0}),this._resizeObserver=new ResizeObserver(this._reposition),this._resizeObserver.observe(document.body)}disconnectedCallback(){super.disconnectedCallback(),window.removeEventListener("scroll",this._reposition,!0),window.removeEventListener("resize",this._reposition),this._resizeObserver?.disconnect(),this._clearHighlight()}updated(n){n.has("annotation")&&this._reposition()}_highlightRelated(){for(let n of this.annotation.selectors)try{document.querySelector(n)?.setAttribute(te,"")}catch{}if(!document.getElementById("db-badge-highlight-style")){let n=document.createElement("style");n.id="db-badge-highlight-style",n.textContent=`[${te}]{outline:2px solid #f59e0b!important;outline-offset:2px!important;}`,document.head.appendChild(n)}}_clearHighlight(){document.querySelectorAll(`[${te}]`).forEach(n=>n.removeAttribute(te))}_handleClick(n){n.stopPropagation();let o=(this.shadowRoot.querySelector(".badge")??this).getBoundingClientRect();this.dispatchEvent(new CustomEvent("annotation-open",{detail:{annotation:this.annotation,rect:o},bubbles:!0,composed:!0}))}render(){return m`
      <div
        class="badge"
        style="position:fixed;top:${this._top}px;left:${this._left}px"
        title=${this.annotation.comment||this.annotation.labels.join(", ")}
        @mouseenter=${this._highlightRelated}
        @mouseleave=${this._clearHighlight}
        @click=${this._handleClick}
      >${this.index+1}</div>
    `}};q.styles=et`
    :host {
      position: fixed;
      z-index: 2147483645;
      pointer-events: auto;
    }

    .badge {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #f59e0b;
      color: #1e1e2e;
      font: 700 10px/20px ui-sans-serif, system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.4);
      transition: transform .1s;
      user-select: none;
    }
    .badge:hover { transform: scale(1.25); }
  `,v([rt({attribute:!1})],q.prototype,"annotation",2),v([rt({type:Number})],q.prototype,"index",2),v([A()],q.prototype,"_top",2),v([A()],q.prototype,"_left",2),q=v([gt("bridge-annotation-badge")],q);var ct=Math.min,E=Math.max,Ut=Math.round;var P=e=>({x:e,y:e}),zo={left:"right",right:"left",bottom:"top",top:"bottom"};function Oe(e,t,n){return E(e,ct(t,n))}function vt(e,t){return typeof e=="function"?e(t):e}function K(e){return e.split("-")[0]}function xt(e){return e.split("-")[1]}function ke(e){return e==="x"?"y":"x"}function Le(e){return e==="y"?"height":"width"}function H(e){let t=e[0];return t==="t"||t==="b"?"y":"x"}function Me(e){return ke(H(e))}function bn(e,t,n){n===void 0&&(n=!1);let o=xt(e),i=Me(e),s=Le(i),r=i==="x"?o===(n?"end":"start")?"right":"left":o==="start"?"bottom":"top";return t.reference[s]>t.floating[s]&&(r=It(r)),[r,It(r)]}function vn(e){let t=It(e);return[ee(e),t,ee(t)]}function ee(e){return e.includes("start")?e.replace("start","end"):e.replace("end","start")}var mn=["left","right"],gn=["right","left"],Io=["top","bottom"],Uo=["bottom","top"];function jo(e,t,n){switch(e){case"top":case"bottom":return n?t?gn:mn:t?mn:gn;case"left":case"right":return t?Io:Uo;default:return[]}}function xn(e,t,n,o){let i=xt(e),s=jo(K(e),n==="start",o);return i&&(s=s.map(r=>r+"-"+i),t&&(s=s.concat(s.map(ee)))),s}function It(e){let t=K(e);return zo[t]+e.slice(t.length)}function Wo(e){return{top:0,right:0,bottom:0,left:0,...e}}function yn(e){return typeof e!="number"?Wo(e):{top:e,right:e,bottom:e,left:e}}function dt(e){let{x:t,y:n,width:o,height:i}=e;return{width:o,height:i,top:n,left:t,right:t+o,bottom:n+i,x:t,y:n}}function wn(e,t,n){let{reference:o,floating:i}=e,s=H(t),r=Me(t),a=Le(r),l=K(t),p=s==="y",d=o.x+o.width/2-i.width/2,c=o.y+o.height/2-i.height/2,h=o[a]/2-i[a]/2,u;switch(l){case"top":u={x:d,y:o.y-i.height};break;case"bottom":u={x:d,y:o.y+o.height};break;case"right":u={x:o.x+o.width,y:c};break;case"left":u={x:o.x-i.width,y:c};break;default:u={x:o.x,y:o.y}}switch(xt(t)){case"start":u[r]-=h*(n&&p?-1:1);break;case"end":u[r]+=h*(n&&p?-1:1);break}return u}async function _n(e,t){var n;t===void 0&&(t={});let{x:o,y:i,platform:s,rects:r,elements:a,strategy:l}=e,{boundary:p="clippingAncestors",rootBoundary:d="viewport",elementContext:c="floating",altBoundary:h=!1,padding:u=0}=vt(t,e),f=yn(u),b=a[h?c==="floating"?"reference":"floating":c],x=dt(await s.getClippingRect({element:(n=await(s.isElement==null?void 0:s.isElement(b)))==null||n?b:b.contextElement||await(s.getDocumentElement==null?void 0:s.getDocumentElement(a.floating)),boundary:p,rootBoundary:d,strategy:l})),y=c==="floating"?{x:o,y:i,width:r.floating.width,height:r.floating.height}:r.reference,w=await(s.getOffsetParent==null?void 0:s.getOffsetParent(a.floating)),_=await(s.isElement==null?void 0:s.isElement(w))?await(s.getScale==null?void 0:s.getScale(w))||{x:1,y:1}:{x:1,y:1},L=dt(s.convertOffsetParentRelativeRectToViewportRelativeRect?await s.convertOffsetParentRelativeRectToViewportRelativeRect({elements:a,rect:y,offsetParent:w,strategy:l}):y);return{top:(x.top-L.top+f.top)/_.y,bottom:(L.bottom-x.bottom+f.bottom)/_.y,left:(x.left-L.left+f.left)/_.x,right:(L.right-x.right+f.right)/_.x}}var Bo=50,$n=async(e,t,n)=>{let{placement:o="bottom",strategy:i="absolute",middleware:s=[],platform:r}=n,a=r.detectOverflow?r:{...r,detectOverflow:_n},l=await(r.isRTL==null?void 0:r.isRTL(t)),p=await r.getElementRects({reference:e,floating:t,strategy:i}),{x:d,y:c}=wn(p,o,l),h=o,u=0,f={};for(let g=0;g<s.length;g++){let b=s[g];if(!b)continue;let{name:x,fn:y}=b,{x:w,y:_,data:L,reset:T}=await y({x:d,y:c,initialPlacement:o,placement:h,strategy:i,middlewareData:f,rects:p,platform:a,elements:{reference:e,floating:t}});d=w??d,c=_??c,f[x]={...f[x],...L},T&&u<Bo&&(u++,typeof T=="object"&&(T.placement&&(h=T.placement),T.rects&&(p=T.rects===!0?await r.getElementRects({reference:e,floating:t,strategy:i}):T.rects),{x:d,y:c}=wn(p,h,l)),g=-1)}return{x:d,y:c,placement:h,strategy:i,middlewareData:f}};var An=function(e){return e===void 0&&(e={}),{name:"flip",options:e,async fn(t){var n,o;let{placement:i,middlewareData:s,rects:r,initialPlacement:a,platform:l,elements:p}=t,{mainAxis:d=!0,crossAxis:c=!0,fallbackPlacements:h,fallbackStrategy:u="bestFit",fallbackAxisSideDirection:f="none",flipAlignment:g=!0,...b}=vt(e,t);if((n=s.arrow)!=null&&n.alignmentOffset)return{};let x=K(i),y=H(a),w=K(a)===a,_=await(l.isRTL==null?void 0:l.isRTL(p.floating)),L=h||(w||!g?[It(a)]:vn(a)),T=f!=="none";!h&&T&&L.push(...xn(a,g,f,_));let _t=[a,...L],G=await l.detectOverflow(t,b),Z=[],U=((o=s.flip)==null?void 0:o.overflows)||[];if(d&&Z.push(G[x]),c){let Q=bn(i,r,_);Z.push(G[Q[0]],G[Q[1]])}if(U=[...U,{placement:i,overflows:Z}],!Z.every(Q=>Q<=0)){var $t,At;let Q=((($t=s.flip)==null?void 0:$t.index)||0)+1,le=_t[Q];if(le&&(!(c==="alignment"?y!==H(le):!1)||U.every(M=>H(M.placement)===y?M.overflows[0]>0:!0)))return{data:{index:Q,overflows:U},reset:{placement:le}};let St=(At=U.filter(tt=>tt.overflows[0]<=0).sort((tt,M)=>tt.overflows[1]-M.overflows[1])[0])==null?void 0:At.placement;if(!St)switch(u){case"bestFit":{var Et;let tt=(Et=U.filter(M=>{if(T){let X=H(M.placement);return X===y||X==="y"}return!0}).map(M=>[M.placement,M.overflows.filter(X=>X>0).reduce((X,Gn)=>X+Gn,0)]).sort((M,X)=>M[1]-X[1])[0])==null?void 0:Et[0];tt&&(St=tt);break}case"initialPlacement":St=a;break}if(i!==St)return{reset:{placement:St}}}return{}}}};var Fo=new Set(["left","top"]);async function qo(e,t){let{placement:n,platform:o,elements:i}=e,s=await(o.isRTL==null?void 0:o.isRTL(i.floating)),r=K(n),a=xt(n),l=H(n)==="y",p=Fo.has(r)?-1:1,d=s&&l?-1:1,c=vt(t,e),{mainAxis:h,crossAxis:u,alignmentAxis:f}=typeof c=="number"?{mainAxis:c,crossAxis:0,alignmentAxis:null}:{mainAxis:c.mainAxis||0,crossAxis:c.crossAxis||0,alignmentAxis:c.alignmentAxis};return a&&typeof f=="number"&&(u=a==="end"?f*-1:f),l?{x:u*d,y:h*p}:{x:h*p,y:u*d}}var En=function(e){return e===void 0&&(e=0),{name:"offset",options:e,async fn(t){var n,o;let{x:i,y:s,placement:r,middlewareData:a}=t,l=await qo(t,e);return r===((n=a.offset)==null?void 0:n.placement)&&(o=a.arrow)!=null&&o.alignmentOffset?{}:{x:i+l.x,y:s+l.y,data:{...l,placement:r}}}}},Sn=function(e){return e===void 0&&(e={}),{name:"shift",options:e,async fn(t){let{x:n,y:o,placement:i,platform:s}=t,{mainAxis:r=!0,crossAxis:a=!1,limiter:l={fn:x=>{let{x:y,y:w}=x;return{x:y,y:w}}},...p}=vt(e,t),d={x:n,y:o},c=await s.detectOverflow(t,p),h=H(K(i)),u=ke(h),f=d[u],g=d[h];if(r){let x=u==="y"?"top":"left",y=u==="y"?"bottom":"right",w=f+c[x],_=f-c[y];f=Oe(w,f,_)}if(a){let x=h==="y"?"top":"left",y=h==="y"?"bottom":"right",w=g+c[x],_=g-c[y];g=Oe(w,g,_)}let b=l.fn({...t,[u]:f,[h]:g});return{...b,data:{x:b.x-n,y:b.y-o,enabled:{[u]:r,[h]:a}}}}}};var Cn=function(e){return e===void 0&&(e={}),{name:"size",options:e,async fn(t){var n,o;let{placement:i,rects:s,platform:r,elements:a}=t,{apply:l=()=>{},...p}=vt(e,t),d=await r.detectOverflow(t,p),c=K(i),h=xt(i),u=H(i)==="y",{width:f,height:g}=s.floating,b,x;c==="top"||c==="bottom"?(b=c,x=h===(await(r.isRTL==null?void 0:r.isRTL(a.floating))?"start":"end")?"left":"right"):(x=c,b=h==="end"?"top":"bottom");let y=g-d.top-d.bottom,w=f-d.left-d.right,_=ct(g-d[b],y),L=ct(f-d[x],w),T=!t.middlewareData.shift,_t=_,G=L;if((n=t.middlewareData.shift)!=null&&n.enabled.x&&(G=w),(o=t.middlewareData.shift)!=null&&o.enabled.y&&(_t=y),T&&!h){let U=E(d.left,0),$t=E(d.right,0),At=E(d.top,0),Et=E(d.bottom,0);u?G=f-2*(U!==0||$t!==0?U+$t:E(d.left,d.right)):_t=g-2*(At!==0||Et!==0?At+Et:E(d.top,d.bottom))}await l({...t,availableWidth:G,availableHeight:_t});let Z=await r.getDimensions(a.floating);return f!==Z.width||g!==Z.height?{reset:{rects:!0}}:{}}}};function oe(){return typeof window<"u"}function ut(e){return Rn(e)?(e.nodeName||"").toLowerCase():"#document"}function S(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}function z(e){var t;return(t=(Rn(e)?e.ownerDocument:e.document)||window.document)==null?void 0:t.documentElement}function Rn(e){return oe()?e instanceof Node||e instanceof S(e).Node:!1}function O(e){return oe()?e instanceof Element||e instanceof S(e).Element:!1}function I(e){return oe()?e instanceof HTMLElement||e instanceof S(e).HTMLElement:!1}function Tn(e){return!oe()||typeof ShadowRoot>"u"?!1:e instanceof ShadowRoot||e instanceof S(e).ShadowRoot}function yt(e){let{overflow:t,overflowX:n,overflowY:o,display:i}=k(e);return/auto|scroll|overlay|hidden|clip/.test(t+o+n)&&i!=="inline"&&i!=="contents"}function On(e){return/^(table|td|th)$/.test(ut(e))}function jt(e){try{if(e.matches(":popover-open"))return!0}catch{}try{return e.matches(":modal")}catch{return!1}}var Ko=/transform|translate|scale|rotate|perspective|filter/,Vo=/paint|layout|strict|content/,pt=e=>!!e&&e!=="none",Pe;function ie(e){let t=O(e)?k(e):e;return pt(t.transform)||pt(t.translate)||pt(t.scale)||pt(t.rotate)||pt(t.perspective)||!se()&&(pt(t.backdropFilter)||pt(t.filter))||Ko.test(t.willChange||"")||Vo.test(t.contain||"")}function kn(e){let t=V(e);for(;I(t)&&!ht(t);){if(ie(t))return t;if(jt(t))return null;t=V(t)}return null}function se(){return Pe==null&&(Pe=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),Pe}function ht(e){return/^(html|body|#document)$/.test(ut(e))}function k(e){return S(e).getComputedStyle(e)}function Wt(e){return O(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}function V(e){if(ut(e)==="html")return e;let t=e.assignedSlot||e.parentNode||Tn(e)&&e.host||z(e);return Tn(t)?t.host:t}function Ln(e){let t=V(e);return ht(t)?e.ownerDocument?e.ownerDocument.body:e.body:I(t)&&yt(t)?t:Ln(t)}function ne(e,t,n){var o;t===void 0&&(t=[]),n===void 0&&(n=!0);let i=Ln(e),s=i===((o=e.ownerDocument)==null?void 0:o.body),r=S(i);if(s){let a=re(r);return t.concat(r,r.visualViewport||[],yt(i)?i:[],a&&n?ne(a):[])}else return t.concat(i,ne(i,[],n))}function re(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}function Dn(e){let t=k(e),n=parseFloat(t.width)||0,o=parseFloat(t.height)||0,i=I(e),s=i?e.offsetWidth:n,r=i?e.offsetHeight:o,a=Ut(n)!==s||Ut(o)!==r;return a&&(n=s,o=r),{width:n,height:o,$:a}}function Hn(e){return O(e)?e:e.contextElement}function wt(e){let t=Hn(e);if(!I(t))return P(1);let n=t.getBoundingClientRect(),{width:o,height:i,$:s}=Dn(t),r=(s?Ut(n.width):n.width)/o,a=(s?Ut(n.height):n.height)/i;return(!r||!Number.isFinite(r))&&(r=1),(!a||!Number.isFinite(a))&&(a=1),{x:r,y:a}}var Xo=P(0);function zn(e){let t=S(e);return!se()||!t.visualViewport?Xo:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function Yo(e,t,n){return t===void 0&&(t=!1),!n||t&&n!==S(e)?!1:t}function Bt(e,t,n,o){t===void 0&&(t=!1),n===void 0&&(n=!1);let i=e.getBoundingClientRect(),s=Hn(e),r=P(1);t&&(o?O(o)&&(r=wt(o)):r=wt(e));let a=Yo(s,n,o)?zn(s):P(0),l=(i.left+a.x)/r.x,p=(i.top+a.y)/r.y,d=i.width/r.x,c=i.height/r.y;if(s){let h=S(s),u=o&&O(o)?S(o):o,f=h,g=re(f);for(;g&&o&&u!==f;){let b=wt(g),x=g.getBoundingClientRect(),y=k(g),w=x.left+(g.clientLeft+parseFloat(y.paddingLeft))*b.x,_=x.top+(g.clientTop+parseFloat(y.paddingTop))*b.y;l*=b.x,p*=b.y,d*=b.x,c*=b.y,l+=w,p+=_,f=S(g),g=re(f)}}return dt({width:d,height:c,x:l,y:p})}function ae(e,t){let n=Wt(e).scrollLeft;return t?t.left+n:Bt(z(e)).left+n}function In(e,t){let n=e.getBoundingClientRect(),o=n.left+t.scrollLeft-ae(e,n),i=n.top+t.scrollTop;return{x:o,y:i}}function Jo(e){let{elements:t,rect:n,offsetParent:o,strategy:i}=e,s=i==="fixed",r=z(o),a=t?jt(t.floating):!1;if(o===r||a&&s)return n;let l={scrollLeft:0,scrollTop:0},p=P(1),d=P(0),c=I(o);if((c||!c&&!s)&&((ut(o)!=="body"||yt(r))&&(l=Wt(o)),c)){let u=Bt(o);p=wt(o),d.x=u.x+o.clientLeft,d.y=u.y+o.clientTop}let h=r&&!c&&!s?In(r,l):P(0);return{width:n.width*p.x,height:n.height*p.y,x:n.x*p.x-l.scrollLeft*p.x+d.x+h.x,y:n.y*p.y-l.scrollTop*p.y+d.y+h.y}}function Go(e){return Array.from(e.getClientRects())}function Zo(e){let t=z(e),n=Wt(e),o=e.ownerDocument.body,i=E(t.scrollWidth,t.clientWidth,o.scrollWidth,o.clientWidth),s=E(t.scrollHeight,t.clientHeight,o.scrollHeight,o.clientHeight),r=-n.scrollLeft+ae(e),a=-n.scrollTop;return k(o).direction==="rtl"&&(r+=E(t.clientWidth,o.clientWidth)-i),{width:i,height:s,x:r,y:a}}var Mn=25;function Qo(e,t){let n=S(e),o=z(e),i=n.visualViewport,s=o.clientWidth,r=o.clientHeight,a=0,l=0;if(i){s=i.width,r=i.height;let d=se();(!d||d&&t==="fixed")&&(a=i.offsetLeft,l=i.offsetTop)}let p=ae(o);if(p<=0){let d=o.ownerDocument,c=d.body,h=getComputedStyle(c),u=d.compatMode==="CSS1Compat"&&parseFloat(h.marginLeft)+parseFloat(h.marginRight)||0,f=Math.abs(o.clientWidth-c.clientWidth-u);f<=Mn&&(s-=f)}else p<=Mn&&(s+=p);return{width:s,height:r,x:a,y:l}}function ti(e,t){let n=Bt(e,!0,t==="fixed"),o=n.top+e.clientTop,i=n.left+e.clientLeft,s=I(e)?wt(e):P(1),r=e.clientWidth*s.x,a=e.clientHeight*s.y,l=i*s.x,p=o*s.y;return{width:r,height:a,x:l,y:p}}function Pn(e,t,n){let o;if(t==="viewport")o=Qo(e,n);else if(t==="document")o=Zo(z(e));else if(O(t))o=ti(t,n);else{let i=zn(e);o={x:t.x-i.x,y:t.y-i.y,width:t.width,height:t.height}}return dt(o)}function Un(e,t){let n=V(e);return n===t||!O(n)||ht(n)?!1:k(n).position==="fixed"||Un(n,t)}function ei(e,t){let n=t.get(e);if(n)return n;let o=ne(e,[],!1).filter(a=>O(a)&&ut(a)!=="body"),i=null,s=k(e).position==="fixed",r=s?V(e):e;for(;O(r)&&!ht(r);){let a=k(r),l=ie(r);!l&&a.position==="fixed"&&(i=null),(s?!l&&!i:!l&&a.position==="static"&&!!i&&(i.position==="absolute"||i.position==="fixed")||yt(r)&&!l&&Un(e,r))?o=o.filter(d=>d!==r):i=a,r=V(r)}return t.set(e,o),o}function ni(e){let{element:t,boundary:n,rootBoundary:o,strategy:i}=e,r=[...n==="clippingAncestors"?jt(t)?[]:ei(t,this._c):[].concat(n),o],a=Pn(t,r[0],i),l=a.top,p=a.right,d=a.bottom,c=a.left;for(let h=1;h<r.length;h++){let u=Pn(t,r[h],i);l=E(u.top,l),p=ct(u.right,p),d=ct(u.bottom,d),c=E(u.left,c)}return{width:p-c,height:d-l,x:c,y:l}}function oi(e){let{width:t,height:n}=Dn(e);return{width:t,height:n}}function ii(e,t,n){let o=I(t),i=z(t),s=n==="fixed",r=Bt(e,!0,s,t),a={scrollLeft:0,scrollTop:0},l=P(0);function p(){l.x=ae(i)}if(o||!o&&!s)if((ut(t)!=="body"||yt(i))&&(a=Wt(t)),o){let u=Bt(t,!0,s,t);l.x=u.x+t.clientLeft,l.y=u.y+t.clientTop}else i&&p();s&&!o&&i&&p();let d=i&&!o&&!s?In(i,a):P(0),c=r.left+a.scrollLeft-l.x-d.x,h=r.top+a.scrollTop-l.y-d.y;return{x:c,y:h,width:r.width,height:r.height}}function Ne(e){return k(e).position==="static"}function Nn(e,t){if(!I(e)||k(e).position==="fixed")return null;if(t)return t(e);let n=e.offsetParent;return z(e)===n&&(n=n.ownerDocument.body),n}function jn(e,t){let n=S(e);if(jt(e))return n;if(!I(e)){let i=V(e);for(;i&&!ht(i);){if(O(i)&&!Ne(i))return i;i=V(i)}return n}let o=Nn(e,t);for(;o&&On(o)&&Ne(o);)o=Nn(o,t);return o&&ht(o)&&Ne(o)&&!ie(o)?n:o||kn(e)||n}var si=async function(e){let t=this.getOffsetParent||jn,n=this.getDimensions,o=await n(e.floating);return{reference:ii(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:o.width,height:o.height}}};function ri(e){return k(e).direction==="rtl"}var ai={convertOffsetParentRelativeRectToViewportRelativeRect:Jo,getDocumentElement:z,getClippingRect:ni,getOffsetParent:jn,getElementRects:si,getClientRects:Go,getDimensions:oi,getScale:wt,isElement:O,isRTL:ri};var Wn=En;var Bn=Sn,Fn=An,qn=Cn;var Kn=(e,t,n)=>{let o=new Map,i={platform:ai,...n},s={...i.platform,_c:o};return $n(e,t,{...i,platform:s})};function Vn(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36)}function li(e){try{return Gt(e)}catch{return e.tagName.toLowerCase()}}function Xn(e){let t=e.tagName.toLowerCase();return e.id?t+=`#${e.id}`:e.classList.length&&(t+=`.${[...e.classList][0]}`),t}var C=class extends R{constructor(){super(...arguments);this.annotation=null;this._selectors=[];this._labels=[];this._source=null;this._comment="";this._top=0;this._left=0;this._pendingId="";this._onKeyDown=n=>{(n.metaKey||n.ctrlKey)&&n.key==="Enter"&&(n.preventDefault(),this._save()),n.key==="Escape"&&(n.stopPropagation(),this._close())}}get _isEdit(){return this.annotation!==null}showForElement(n){let o=li(n);if(this.hidden===!1&&!this._isEdit&&!this._source){this._selectors.includes(o)||(this._selectors=[...this._selectors,o],this._labels=[...this._labels,Xn(n)]);return}this._pendingId=Vn(),this._selectors=[o],this._labels=[Xn(n)],this._source=null,this._comment="",this.annotation=null,this.hidden=!1,this._floatNear(n.getBoundingClientRect())}showForSource(n){if(!this.hidden&&!this._source){this._source=n;return}this._pendingId=Vn(),this._selectors=[],this._labels=[],this._source=n,this._comment="",this.annotation=null,this.hidden=!1,this._top=Math.max(16,window.innerHeight-280),this._left=Math.max(16,window.innerWidth-340)}showForAnnotation(n,o){this._pendingId=n.id,this._selectors=[...n.selectors],this._labels=[...n.labels],this._source=n.source??null,this._comment=n.comment,this.annotation=n,this.hidden=!1;let i=o instanceof Element?o.getBoundingClientRect():o??this._firstElementRect(n);i&&this._floatNear(i)}_firstElementRect(n){for(let o of n.selectors)try{let i=document.querySelector(o);if(i)return i.getBoundingClientRect()}catch{}return null}_floatNear(n){this.updateComplete.then(()=>this._computeFloat(n))}_computeFloat(n){let o={getBoundingClientRect:()=>n},i=this.shadowRoot?.querySelector(".popover");i&&Kn(o,i,{placement:"left-start",strategy:"fixed",middleware:[Wn(8),Fn({fallbackPlacements:["right-start","bottom-start","top-start"]}),qn({padding:8,apply({availableHeight:s,availableWidth:r,elements:a}){Object.assign(a.floating.style,{maxHeight:`${Math.max(s,120)}px`,maxWidth:`${Math.max(r,200)}px`,overflowY:"auto"})}}),Bn({padding:8})]}).then(({x:s,y:r})=>{this._left=s,this._top=r})}_removeChip(n){this._selectors=this._selectors.filter((o,i)=>i!==n),this._labels=this._labels.filter((o,i)=>i!==n),this._selectors.length===0&&!this._source&&this._close()}_save(){let n={id:this._pendingId,selectors:[...this._selectors],labels:this._labels.length?[...this._labels]:this._source?[`${this._source.file}:${this._source.line}`]:[],comment:this._comment,pageUrl:location.href,timestamp:Date.now(),...this._source?{source:this._source}:{}};this.dispatchEvent(new CustomEvent("annotation-save",{detail:n,bubbles:!0,composed:!0})),this._close()}_delete(){this.annotation&&this.dispatchEvent(new CustomEvent("annotation-delete",{detail:{id:this.annotation.id},bubbles:!0,composed:!0})),this._close()}_close(){this.hidden=!0,this.annotation=null,this._selectors=[],this._labels=[],this._source=null,this._comment="",this.dispatchEvent(new CustomEvent("annotation-cancel",{bubbles:!0,composed:!0}))}render(){return m`
      <div class="popover" style="top:${this._top}px;left:${this._left}px" @keydown=${this._onKeyDown}>
        <div class="title">
          Annotation
          <span>${this._isEdit?"editing":this._source&&!this._selectors.length?"from code-inspector":"click more to add"}</span>
        </div>

        ${this._source?m`
          <div class="source-chip" title="${this._source.file}:${this._source.line}:${this._source.column}">
            📍 <span class="source-chip-label">${this._source.file}:${this._source.line}:${this._source.column}</span>
          </div>
        `:""}

        ${this._selectors.length?m`
          <div class="chips">
            ${this._selectors.map((n,o)=>m`
              <span class="chip" title=${n}>
                ${this._labels[o]}
                <button @click=${()=>this._removeChip(o)}>×</button>
              </span>
            `)}
          </div>
        `:""}

        ${!this._isEdit&&!this._source?m`<div class="hint">Keep clicking elements to group them</div>`:""}

        <textarea
          placeholder="Describe what to tweak…"
          .value=${this._comment}
          @input=${n=>{this._comment=n.target.value}}
        ></textarea>

        <div class="actions">
          <button class="btn btn-save" @click=${this._save}>${this._isEdit?"Update":"Save"}</button>
          <button class="btn btn-delete" @click=${this._delete}>Delete</button>
          <button class="btn btn-cancel" @click=${this._close}>Cancel</button>
        </div>
      </div>
    `}};C.styles=et`
    :host {
      --db-bg: #1e1e2e;
      --db-surface: #313244;
      --db-border: #45475a;
      --db-text: #cdd6f4;
      --db-muted: #6c7086;
      --db-amber: #f59e0b;
      --db-amber-dim: rgba(245,158,11,.12);
      --db-blue: #89b4fa;
      --db-red: #f38ba8;
      --db-font-mono: ui-monospace, monospace;
    }
    :host([hidden]) { display: none !important; }

    .popover {
      position: fixed;
      z-index: 2147483646;
      background: var(--db-bg);
      color: var(--db-text);
      border: none;
      border-radius: 8px;
      padding: 12px 14px;
      width: 300px;
      box-shadow: 0 8px 24px rgba(0,0,0,.6);
      font: 13px/1.5 var(--db-font-mono);
    }

    .title {
      margin: 0 0 8px;
      font-size: 11px;
      color: var(--db-amber);
      font-weight: 600;
      letter-spacing: .05em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .title span { color: var(--db-muted); font-weight: 400; text-transform: none; letter-spacing: 0; }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--db-amber-dim);
      border: 1px solid var(--db-amber);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      color: var(--db-amber);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip button {
      all: unset;
      cursor: pointer;
      color: var(--db-muted);
      font-size: 13px;
      line-height: 1;
    }
    .chip button:hover { color: var(--db-red); }

    .hint {
      font-size: 11px;
      color: var(--db-muted);
      margin-bottom: 8px;
      font-style: italic;
    }

    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--db-surface);
      color: var(--db-text);
      border: 1px solid var(--db-border);
      border-radius: 4px;
      padding: 6px 8px;
      font: inherit;
      font-size: 12px;
      resize: vertical;
      min-height: 60px;
      outline: none;
    }
    textarea:focus { border-color: var(--db-blue); }

    .actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    button.btn {
      flex: 1;
      padding: 5px 8px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
    }
    .btn-save { background: var(--db-amber); color: #1e1e2e; }
    .btn-cancel { background: var(--db-border); color: var(--db-text); }
    .btn-delete { background: transparent; color: var(--db-red); border: 1px solid var(--db-red); }

    .source-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(137,180,250,.12);
      border: 1px solid var(--db-blue);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      color: var(--db-blue);
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .source-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,v([rt({attribute:!1})],C.prototype,"annotation",2),v([A()],C.prototype,"_selectors",2),v([A()],C.prototype,"_labels",2),v([A()],C.prototype,"_source",2),v([A()],C.prototype,"_comment",2),v([A()],C.prototype,"_top",2),v([A()],C.prototype,"_left",2),v([A()],C.prototype,"_pendingId",2),C=v([gt("bridge-annotation-popover")],C);function Yn(){if(document.querySelector("bridge-panel")||document.body.appendChild(document.createElement("bridge-panel")),!document.querySelector("bridge-annotation-popover")){let e=document.createElement("bridge-annotation-popover");e.hidden=!0,document.body.appendChild(e)}}function Jn(){Yn(),cn()}document.body?Jn():document.addEventListener("DOMContentLoaded",Jn,{once:!0});})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
@lit/reactive-element/decorators/custom-element.js:
@lit/reactive-element/decorators/property.js:
@lit/reactive-element/decorators/state.js:
@lit/reactive-element/decorators/event-options.js:
@lit/reactive-element/decorators/base.js:
@lit/reactive-element/decorators/query.js:
@lit/reactive-element/decorators/query-all.js:
@lit/reactive-element/decorators/query-async.js:
@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
