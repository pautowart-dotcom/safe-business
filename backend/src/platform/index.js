const express = require('express');
const authRoutes = require('./auth.routes');
const companiesRoutes = require('./companies.routes');
const branchesRoutes = require('./branches.routes');
const membershipsRoutes = require('./memberships.routes');
const modulesRoutes = require('./modules.routes');
const adminRoutes = require('./admin.routes');
const legalRoutes = require('./legal.routes');
const supportRoutes = require('./support.routes');
const calendarRoutes = require('./calendar.routes');
const dailyTasksRoutes = require('./daily-tasks.routes');
const dashboardRoutes = require('./dashboard.routes');

const platformRouter = express.Router();
platformRouter.use('/companies', companiesRoutes);
platformRouter.use('/branches', branchesRoutes);
platformRouter.use('/memberships', membershipsRoutes);
platformRouter.use('/modules', modulesRoutes);
platformRouter.use('/admin', adminRoutes);
platformRouter.use('/support', supportRoutes);
platformRouter.use('/calendar', calendarRoutes);
platformRouter.use('/daily-tasks', dailyTasksRoutes);
platformRouter.use('/dashboard', dashboardRoutes);

module.exports = { authRoutes, platformRouter, legalRoutes };
