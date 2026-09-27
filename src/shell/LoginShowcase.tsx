import logo from '../logo.svg';

// The panel beside the sign-in form on wide screens. Its content is still to come; until then it holds the duck alone.
export default function LoginShowcase() {
  return (
    <div className="rp-login-showcase" aria-hidden="true">
      <img src={logo} alt="" />
    </div>
  );
}
