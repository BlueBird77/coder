import { useAuth } from "components/AuthProvider/AuthProvider";
import { FC } from "react";
import { Helmet } from "react-helmet-async";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { retrieveRedirect } from "utils/redirect";
import { LoginPageView } from "./LoginPageView";
import { getApplicationName } from "utils/appearance";

export const LoginPage: FC = () => {
  const location = useLocation();
  const {
    isSignedIn,
    isConfiguringTheFirstUser,
    signIn,
    isSigningIn,
    authMethods,
    signInError,
  } = useAuth();
  const redirectTo = retrieveRedirect(location.search);
  const applicationName = getApplicationName();
  const navigate = useNavigate();

  if (isSignedIn) {
    // If the redirect is going to a workspace application, and we
    // are missing authentication, then we need to change the href location
    // to trigger a HTTP request. This allows the BE to generate the auth
    // cookie required.
    // If no redirect is present, then ignore this branched logic.
    if (redirectTo !== "" && redirectTo !== "/") {
      try {
        // This catches any absolute redirects. Relative redirects
        // will fail the try/catch. Subdomain apps are absolute redirects.
        const redirectURL = new URL(redirectTo);
        if (redirectURL.host !== window.location.host) {
          window.location.href = redirectTo;
          return <></>;
        }
      } catch {
        // Do nothing
      }
      // Path based apps.
      if (redirectTo.includes("/apps/")) {
        window.location.href = redirectTo;
        return <></>;
      }
    }
    return <Navigate to={redirectTo} replace />;
  } else if (isConfiguringTheFirstUser) {
    return <Navigate to="/setup" replace />;
  } else {
    return (
      <>
        <Helmet>
          <title>Sign in to {applicationName}</title>
        </Helmet>
        <LoginPageView
          authMethods={authMethods}
          error={signInError}
          isSigningIn={isSigningIn}
          onSignIn={async ({ email, password }) => {
            await signIn(email, password);
            navigate("/");
          }}
        />
      </>
    );
  }
};

export default LoginPage;
