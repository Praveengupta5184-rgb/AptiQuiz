import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import TeacherLogin from './pages/TeacherLogin';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentLogin from './pages/StudentLogin';
import StudentDashboard from './pages/StudentDashboard';
import StudentJoin from './pages/StudentJoin';
import StudentGame from './pages/StudentGame';
import SpectatorGame from './pages/SpectatorGame';
import './App.css';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/teacher/login" element={<TeacherLogin />} />
                <Route path="/teacher/*" element={<TeacherDashboard />} />
                <Route path="/student/login" element={<StudentLogin />} />
                <Route path="/student/*" element={<StudentDashboard />} />
                <Route path="/join" element={<StudentJoin />} />
                <Route path="/room/:code" element={<StudentGame />} />
                <Route path="/spectate/:code" element={<SpectatorGame />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
