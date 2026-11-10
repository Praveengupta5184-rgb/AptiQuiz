import React from 'react';
import { Routes, Route } from 'react-router-dom';
import StudentTeamBattleLanding from './StudentTeamBattleLanding';
import TeamSelection from './TeamSelection';
import BattleGame from './BattleGame';
import BattleResults from './BattleResults';

function StudentTeamBattles() {
    return (
        <Routes>
            <Route path="/" element={<StudentTeamBattleLanding />} />
            <Route path="/:code/select-team" element={<TeamSelection />} />
            <Route path="/:code/select team" element={<TeamSelection />} />
            <Route path="/:code/select%20team" element={<TeamSelection />} />
            <Route path="/:code/game" element={<BattleGame />} />
            <Route path="/:code/results" element={<BattleResults />} />
            <Route path="/:code" element={<TeamSelection />} />
            <Route path="/:code/*" element={<TeamSelection />} />
            <Route path="*" element={<StudentTeamBattleLanding />} />
        </Routes>
    );
}

export default StudentTeamBattles;
