import { ButtonPrimary, Text } from "@primer/react";
import { Dialog } from "@primer/react/lib/Dialog/Dialog";
import { MatrixClient } from "matrix-js-sdk";
import React from "react";
import LoginForm from "./LoginForm";
import { createMatrixClient, LoginData } from "./utils";

export const LoginButton = ({
  isOpen,
  setIsOpen,
  onLogin,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onLogin: (client: MatrixClient, roomAlias: string) => void;
}) => {
  const [loginData, setLoginData] = React.useState<LoginData>();
  const [status, setStatus] = React.useState<"ok" | "loading" | "failed">("ok");
  const openDialog = React.useCallback(() => setIsOpen(true), [setIsOpen]);
  const closeDialog = React.useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const doLogin = React.useCallback(() => {
    setStatus("loading");
    (async () => {
      try {
        const matrixClient = await createMatrixClient(loginData!);
        setIsOpen(false);
        onLogin(matrixClient, loginData!.roomAlias);
        setStatus("ok");
      } catch (e) {
        setStatus("failed");
      }
    })();
  }, [setIsOpen, loginData, onLogin]);

  return (
    <>
      <ButtonPrimary onClick={openDialog}>Sign in with Matrix</ButtonPrimary>
      {isOpen && (
        <Dialog
          title="Sign in to Matrix"
          //   subtitle={
          //     <>
          //       This is a <b>description</b> of the dialog.
          //     </>
          //   }
          renderFooter={(props) => (
            <Dialog.Footer>
              <Text fontSize={10} sx={{ flex: 1 }}>
                Support for OpenID / OAuth is{" "}
                <a
                  target="_blank"
                  href="https://matrix.org/blog/posts#openid-connect"
                  rel="noreferrer">
                  in progress
                </a>
                .
              </Text>
              <Dialog.Buttons buttons={props.footerButtons!} />
            </Dialog.Footer>
          )}
          footerButtons={[
            {
              content: "Sign in",
              buttonType: "primary",
              disabled: status === "loading",
              onClick: doLogin,
            },
          ]}
          onClose={closeDialog}>
          <LoginForm setLoginData={setLoginData} status={status} />
        </Dialog>
      )}
    </>
  );
};
