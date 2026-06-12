// useOperatingInputs.js
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';
import { useEffect, useContext } from 'react';


export const useOperatingInputs = () => {
    const { retestPointsState, retestPointsStatePrimary, amrsiData, vpprData } = useContext(ContextGraphics)
    // ====================== HOOKS DOS INDICADORES ======================
    useEffect(() => {
        console.log(retestPointsState);
        console.log(retestPointsStatePrimary);
        console.log(amrsiData);
        console.log(vpprData);

    }, [])
};  