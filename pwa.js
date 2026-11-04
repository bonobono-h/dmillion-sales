(()=>{
  if('serviceWorker' in navigator){
    addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=20261104-members-view-2',{scope:'./'}).catch(()=>{}),{once:true});
  }

  const ua=navigator.userAgent||'';
  const ios=/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const params=new URLSearchParams(location.search),preview=params.get('demo')==='1'&&params.get('iosGuide')==='1';
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  if((!ios&&!preview)||standalone||sessionStorage.getItem('dmillion-ios-guide-dismissed')==='1')return;

  const show=()=>{
    if(document.getElementById('iosInstallGuide'))return;
    const guide=document.createElement('aside');
    guide.id='iosInstallGuide';guide.className='ios-install-guide';guide.setAttribute('role','note');
    guide.innerHTML='<strong>아이폰 홈 화면에 DMILLION 추가</strong><span>Safari의 <b>공유 버튼</b> → <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>를 누르세요.</span><button type="button" class="ios-install-close" aria-label="설치 안내 닫기">×</button>';
    guide.querySelector('button').addEventListener('click',()=>{sessionStorage.setItem('dmillion-ios-guide-dismissed','1');guide.remove();});
    document.body.appendChild(guide);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
})();

