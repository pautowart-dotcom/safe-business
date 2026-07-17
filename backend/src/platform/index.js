const express = require('express');
const authRoutes = require('./auth.routes');
const companiesRoutes = require('./companies.routes');
const branchesRoutes = require('./branches.routes');
const membershipsRoutes = require('./memberships.routes');
const modulesRoutes = require('./modules.routes');
const adminRoutes = require('./admin.routes');

const platformRouter = express.Router();
platformRouter.use('/companies', companiesRoutes);
platformRouter.use('/branches', branchesRoutes);
platformRouter.use('/memberships', membershipsRoutes);
platformRouter.use('/modules', modulesRoutes);
platformRouter.use('/admin', adminRoutes);

module.exports = { authRoutes, platformRouter };
