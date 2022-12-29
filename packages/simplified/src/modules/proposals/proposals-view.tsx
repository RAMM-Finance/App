import React, {useState} from "react"
import { useHistory } from "react-router-dom"
import {Link} from "react-router-dom";
import makePath from "./make-path";
import makeQuery from "./make-query";
import Styles from "./proposals-view.styles.less";
import {TabNavItem, TabContent} from "./tabs";
import CreditLineProposalView from "../creditline-proposal/creditline-proposal-view";
import GeneralInstrumentForm from "./general-instrument-form";


const ProposalsView = () => {
    const [ activeTab, setActiveTab ] = useState("0");

    return (
        <div className={Styles.ProposalsView}>
            <section>
                    <TabNavItem title="General" id="0" activeTab={activeTab} setActiveTab={setActiveTab}/>
                    <TabNavItem title="Creditline" id="1" activeTab={activeTab} setActiveTab={setActiveTab}/>
                    <TabNavItem title="Options" id="2" activeTab={activeTab} setActiveTab={setActiveTab}/>
            </section>
            <section>
                <TabContent id="0" activeTab={activeTab}>
                    <h3>
                        General Form
                    </h3>
                </TabContent>
                <TabContent id="1" activeTab={activeTab}> 
                    <CreditLineProposalView />
                </TabContent>
                
                <TabContent id="2" activeTab={activeTab}>
                    <h3>
                        Options Form
                    </h3>
                </TabContent>
            </section>

        </div>
    )
}
export default ProposalsView;