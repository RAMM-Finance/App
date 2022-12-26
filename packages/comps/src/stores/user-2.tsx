import React, {useEffect} from "react";
import { DEFAULT_USER_STATE, STUBBED_USER_ACTIONS } from "./constants-2";
import { useUser } from "./user-hooks-2";

export const UserContext = React.createContext({
  ...DEFAULT_USER_STATE,
  actions: STUBBED_USER_ACTIONS,
});

export const UserStore = {
  actionsSet: false,
  get: () => ({ ...DEFAULT_USER_STATE }),
  actions: STUBBED_USER_ACTIONS,
};

export const UserProvider = ({ children }: any) => {
  const state = useUser();
  const { updateUserNFTBalances } = state.actions;

  if (!UserStore.actionsSet) {
    UserStore.actions = state.actions;
    UserStore.actionsSet = true;
  }
  const readableState = { ...state };
  delete readableState.actions;
  UserStore.get = () => readableState;

  return <UserContext.Provider value={state}>{children}</UserContext.Provider>;
};

export const useUserStore = () => React.useContext(UserContext);

const output = {
  UserProvider,
  useUserStore,
  UserStore,
};

export default output;