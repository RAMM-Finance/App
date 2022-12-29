import React from "react"
// import Styles from "./tabs.styles.less";
import classNames from "classnames";
import Styles from "./proposals-view.styles.less";

export const TabContent: React.FC = ({id, activeTab, children}) => {
 return (
   activeTab === id ? <div className="TabContent">
     { children }
   </div>
   : null
 );
};

export const TabNavItem: React.FC = ({ id, title, activeTab, setActiveTab }) => {
    const handleClick = () => {
      setActiveTab(id);
    };
    
   return (
      <div onClick={handleClick} className={classNames({ [Styles.Active]: activeTab === id})}>
        { title }
      </div>
    );
   };
 