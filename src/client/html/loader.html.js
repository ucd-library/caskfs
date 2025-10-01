export default `
  <style>
    #site-loader {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: var(--white, #fff);
    }
    .site-loader__icon {
      z-index: 2;
      width: 5rem;
      color: var(--ucd-blue, #022851);
      animation: pulse-color 5s infinite ease-in-out;
    }
    .site-loader__icon svg {
      fill: currentColor;
    }
    @keyframes ripple-animation {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(3);
        opacity: 0;
      }
    }
    .site-loader__icon-container {
      position: relative;
      width: 6rem;
      height: 6rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .site-loader__ripple {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid var(--ucd-gold-50, #fde9ac);
      border-radius: 50%;
      animation: ripple-animation 2s infinite ease-out;
    }
    .site-loader__ripple:nth-child(2) {
      animation-delay: 1s;
      opacity: 0;
      animation-fill-mode: forwards;
    }
    @keyframes pulse-color {
      0% {
        color: var(--ucd-blue, #022851);
      }
      50% {
        color: var(--ucd-blue-90, #14447a);
      }
      100% {
        color: var(--ucd-blue, #022851);
      }
    }
  </style>
  <div id='site-loader'>
    <div class='site-loader__icon-container'>
      <div class='site-loader__icon'>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 444 444">
          <path d="M231.86,331.38l-45.6,12.41v33.62l141,22.18V138.37l-71.48-11.24v172.31c.03,14.5-10.28,28.23-23.92,31.94Z" style="fill:none;"/>
          <path d="M186.26,343.79l45.6-12.41c13.65-3.71,23.95-17.44,23.95-31.94V127.13l-69.55-10.94v227.6Z"/>
          <path d="M255.81,93.88V6L108.73,37.13c-14.18,3-24.87,16.68-24.87,31.87V371.7l69.56-18.93V77.77l102.39,16.11Z"/>
          <path d="M334.42,106.25l-78.61-12.37v33.25l71.48,11.24V399.59l-141-22.18v-33.62l-32.84,8.94v25.48c0,15.3,11.29,29.06,25.71,31.33l181,28.46V137.58c-.02-15.3-11.32-29.07-25.74-31.33Z"/>
        </svg>
      </div>
      <div class="site-loader__ripple"></div>
      <div class="site-loader__ripple"></div>
    </div>
  </div>
`;
