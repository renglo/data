# operate_game.py
from flask import current_app

from datetime import datetime

from renglo.data.data_controller import DataController
from renglo.docs.docs_controller import DocsController
from renglo.auth.auth_controller import AuthController
from renglo.blueprint.blueprint_controller import BlueprintController
from renglo.common import load_config


'''
This class operates at high level
It creates a portfolio, org, team and a tool
It should be executed only once and there should be protection in place in case it is run more than once
Nnothing should happen if it is run multiple times.
'''

class SchdOnboardings:
    def __init__(self):
        # Load config for handlers (independent of Flask)
        config = load_config()
        
        self.DAC = DataController(config=config)
        self.AUC = AuthController(config=config)
        self.DCC = DocsController(config=config)
        self.BPC = BlueprintController(config=config)
        self.bridge = {}
          
        
    def create_portfolio(self,name):
        
        action = 'create_portfolio'
        current_app.logger.debug('Creating portfolio:'+name)
        
        #1. Create Porfolio Document
        kwargs = {}
        kwargs['name'] = name
        response = self.AUC.create_entity('portfolio',**kwargs)
        self.bridge['portfolio_id'] = response['document']['_id']
        
        
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'The portfolio could not be created',
                'input':kwargs,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'The portfolio has been created',
                'input':kwargs,
                'output':response
                }
                   
    
    def create_team(self,portfolio,name):
        
        action = 'create_team'
        current_app.logger.debug('Creating team:'+name)
        
        kwargs = {}
        kwargs['name'] = name
        kwargs['portfolio_id'] = portfolio #This is the portfolio_id
        response = self.AUC.create_entity('team',**kwargs)
        self.bridge['team_id'] = response['document']['_id']
  
        # Team documents explicitly relate to Portfolios. That's why you don't need a Portfolio:Teams rel.

        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'The team could not be created',
                'input':kwargs,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'The team has been created',
                'input':kwargs,
                'output':response
                }
            
            
    
    def create_team_portfolio_rel(self,portfolio,team):
        
        action = 'create_team_portfolio_rel'
        current_app.logger.debug('Creating Team-Portfolio relationship')
        
        rel_data = {}
        rel_data['portfolio_id'] = portfolio #This is the portfolio_id
        rel_data['team_id'] = team #This is the team_id
        response = self.AUC.create_rel('team:portfolio',**rel_data)

        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not create Team-Portfolio relationship',
                'input':rel_data,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Team-Portfolio relationship has been created',
                'input':rel_data,
                'output':response
                }
            
            
            
    def create_team_user_rel(self,team):
        
        #Part 1 : Team-User rel
        action='create_team_user_rel'
        current_app.logger.debug('Creating the Team-User relationship')
        
        rel_data = {}
        rel_data['user_id'] = self.AUC.get_current_user()
        rel_data['team_id'] = team #This is the team_id
        
        
        response_a = self.AUC.create_rel('team:user',**rel_data)
        response_b = self.AUC.create_rel('user:team',**rel_data)
        
        response = []
        response.append(response_a)
        response.append(response_b)
        
        if not response_a['success'] or not response_b['success'] :
            return{
                'success':False,
                'action':action,
                'message':'Could not create Team-User relationships',
                'input':rel_data,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Team-User relationship has been created',
                'input':rel_data,
                'output':response
                }
                    
            
            
    def create_tool(self,portfolio,tool,handle):

        #1. Create the Tool blueprints (if they don't exist)
        #2. Create the tool entity
                
        action = 'create_tool'
        current_app.logger.debug('Installing default tool in portfolio')
        
        kwargs = {}
        kwargs['name'] = tool
        kwargs['handle'] = handle
        kwargs['portfolio_id'] = portfolio #This is the portfolio_id
        response = self.AUC.create_entity('tool',**kwargs)
        self.bridge['tool_id'] = response['document']['_id']

        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not install tool',
                'input':kwargs,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Tool installed',
                'input':kwargs,
                'output':response
                }
            
    

        
    def create_org(self,portfolio,name,handle):
        
        action = 'create_org'
        current_app.logger.debug('Creating new org')
        
        kwargs = {}
        kwargs['name'] = name
        kwargs['handle'] = handle
        kwargs['portfolio_id'] = portfolio #This is the portfolio_id
        response = self.AUC.create_entity('org',**kwargs)
        self.bridge['org_id'] = response['document']['_id']
        
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not create org',
                'input':kwargs,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Org has been created',
                'input':kwargs,
                'output':response
                }

        
        # Org documents explicitly relate to Portfolios. That's why you don't need a Portfolio:Orgs rel.

        
            
    
    def create_team_org_rel(self,team,tool,org):
        
        action = 'create_team_org_rel'
        current_app.logger.debug('Create team to org rel')
        
        rel_data = {}
        rel_data['team_id'] = team #This is the team_id
        rel_data['org_id'] = org #This is the org_id
        response = self.AUC.create_rel('team:org',**rel_data)

        
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not create Team-Org relationship',
                'input':rel_data,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Team-Org rel has been created',
                'input':rel_data,
                'output':response
                }
            
            
            
    def create_team_tool_org_rel(self,team,tool,org):
        
        action = 'create_team_tool_org_rel'
        current_app.logger.debug('Create Team/Tool to org : DataEntry')
        
        rel_data = {}
        rel_data['team_id'] = team #This is the default team_id
        rel_data['tool_id'] = tool #This is the default tool_id
        rel_data['org_id'] = org #This is the default org_id
        response = self.AUC.create_rel('team/tool:org',**rel_data)
            
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not create Team/Tool-action relationship',
                'input':rel_data,
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Team/Tool-action relationship has been created',
                'input':rel_data,
                'output':response
                }
            
            
    def create_job_docs(self,portfolio,org,jobs):
        action = 'create_job_docs'
           
        
        responses = []
        all_successful = True
        
        for job in jobs:
            response, status = self.DAC.post_a_b(portfolio, org, 'schd_jobs', job)
            responses.append(response)
            if not response['success']:
                all_successful = False
        
        return {
            'success': all_successful,
            'action': action,
            'message': 'Job Documents created' if all_successful else 'Could not create job documents',
            'input': [],
            'output': responses
        }
    
    
    def create_config_doc(self,portfolio,org,payload,ring):
        
        action = 'create_config_doc'
          
        blueprint = self.BPC.get_blueprint('irma',ring,'last')
        
        print(blueprint)
        
        config_doc = {}
        
        for field in blueprint['fields']:  
            if field['name'] in payload:
                config_doc[field['name']] = payload[field['name']]
            else:
                config_doc[field['name']] = field['default']
                         
        response, status = self.DAC.post_a_b(portfolio,org,ring,config_doc)
       
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Could not create config',
                'input':[],
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'Config created',
                'input':[],
                'output':response
                }
            
        
    def refresh_tree(self):
        
        action = "refresh_tree"
        
        response = self.AUC.refresh_tree()
        
        if not response['success']:
            return{
                'success':False,
                'action':action,
                'message':'Tree could not be generated',
                'input':[],
                'output':response
                }
        else:
            return{
                'success':True,
                'action':action,
                'message':'The tree has been generated',
                'input':[],
                'output':response
                }
        
        
        
                 
    
    def run(self,payload):
        
        results = []
        
        '''
        USE CASE 1: Install the tool in a new portfolio. 
        INPUT: Name of first org
        The user is new and doesn't know anything about setting portfolios, 
        orgs, teams or tools. The onboarding will generate a default portfolio, 
        a default team a new tool instance and an org called as indicated in the 
        input. Everything is going to be ready to go. 
        
        
        USE CASE 2: Install the tool in an existing portfolio
        INPUT: Portfolio ID, First Team to use tool, First Org to use tool
        Because we don't know how many orgs and teams there are, it is 
        better to just add the Tool to the Portfolio and have the user 
        assign teams and orgs to it. In case there needs to be a team or
        org to be added, the user can add and link them to the tool at any
        moment.  
        
        '''
        existing_portfolio = None
        existing_team = None
        existing_org = None
        # Check if portfolio, team, org exist in the request
        if 'portfolio' in payload:
            if payload['portfolio'] != '':
                existing_portfolio = str(payload['portfolio']) 
                
        if 'team' in payload:
            if payload['team'] != '':
                existing_team = str(payload['team']) 
                
        if 'org' in payload:
            if payload['org'] != '':
                existing_org = str(payload['org']) 
          
          
        # Step 1: Create a new portfolio
        # OUTPUT: self.bridge['portfolio_id']
        if not existing_portfolio:
            #response_1 = self.create_portfolio('Ideas')
            #results.append(response_1)
            #if not response_1['success']: return {'success':False,'output':'No portfolio selected'}
            return {'success':False,'output':'No portfolio selected'}
        #else:
        #    self.bridge['portfolio_id'] = payload['portfolio']
        
        
        
        '''
        ## OPTIONAL IF PAYLOAD PROVIDES TEAM_ID
        # Step 2: Create a new team:admin"
        # OUTPUT: self.bridge['team_id']
        if not existing_team:
            response_2 = self.create_team(self.bridge['portfolio_id'],'Staff')
            results.append(response_2)
            if not response_2['success']: return {'success':False,'output':results}
        else:
            self.bridge['team_id'] = payload['team']
        '''
        
        '''  
        # Step 3: Add the team to the portfolio
        response_3 = self.create_team_portfolio_rel(self.bridge['portfolio_id'],self.bridge['team_id'])
        results.append(response_3)
        if not response_3['success']: return {'success':False,'output':results}
        '''
        
        '''
        # Step 4: Add the user to the team: <user_id>"admin"
        response_4 = self.create_team_user_rel(self.bridge['team_id'])
        results.append(response_4)
        if not response_4['success']: return {'success':False,'output':results}
        '''
        
        
        # Step 5: Create a tool
        # Step 5b: Add the tool to the portfolio
        # OUTPUT: self.bridge['tool']
        response_5 = self.create_tool(existing_portfolio,'Schd','schd')
        results.append(response_5)
        if not response_5['success']: return {'success':False,'output':results}
        
        
        '''
        ## OPTIONAL IF PAYLOAD PROVIDES ORG
        # Step 6: Create a new org:[handle_name].
        # Step 6b: Add the org to that portfolio:  [handle name] > "handles"
        # OUTPUT: self.bridge['org_id']
        if not existing_org:
            if 'name' not in payload:
                payload['name'] = 'first';
            response_6 = self.create_org(self.bridge['portfolio_id'],payload['name'],payload['name'])
            results.append(response_6)
            if not response_6['success']: return {'success':False,'output':results}
        else:
            self.bridge['org_id'] = payload['org']
        '''
        
        
        # Step 7: Add the team to the org  # IS THIS NEEDED? THIS IS ACHIEVED BY ASSIGNING A TEAM TO A TOOL TO AN ORG.
        #response_7 = self.create_team_org_rel(self.bridge['team_id'],self.bridge['tool_id'],self.bridge['org_id'])
        #results.append(response_7)
        #if not response_7['success']: return {'success':False,'output':results}
        
        '''
        # Step 8: Add team tool to org
        # Step 8b: Add the tool to the team to the org
        response_8 = self.create_team_tool_org_rel(self.bridge['team_id'],self.bridge['tool_id'],self.bridge['org_id'])
        results.append(response_8)
        if not response_8['success']: return {'success':False,'output':results}
        '''
        
        
        
        
        # It takes more than just creating a team-tool-org relationship to activate the tool. 
        # You also need to create the job_docs and the config_doc for every org.
        # If we are installing this tool in an existing Portfolio with existing orgs, we would need
        # to run steps 9 and 10 in every org in that portfolio. The problem is that no orgs 
        # are assigned to this tool in this case as the user needs to do it manually. 
        # A Solution would be to run a check every time a team-tool-org rel is created (but that happens much after this onboarding script is run)
        # What we could do here is to skip these steps if it is a installation on an existing portfolio.
        
        '''  
        # Step 9: Create the job documents       
        jobs = [{
                "description": "This job is called to execute periodic operational tasks",
                "handler": "schd/heartbeat",
                "name": "Heartbeat",
                "status": "available",
                "type": "schd",
                "version": "1.0.0"
            }]
    
        response_9 = self.create_job_docs(self.bridge['portfolio_id'], self.bridge['org_id'],jobs) 
        results.append(response_9)
        if not response_9['success']: return {'success':False,'output':results}
        '''
    
        '''
        # Step 10: Create the config singleton document
        response_10 = self.create_config_doc(self.bridge['portfolio_id'], self.bridge['org_id'],payload,'schd_config')
        results.append(response_10)
        if not response_10['success']: return {'success':False,'output':results}
        '''
        
        
        # Step 11: Refresh the tree
        response_11 = self.refresh_tree()
        results.append(response_11)
        if not response_11['success']: return {'success':False,'output':results}
        
          
        #All went well, report back
        return {'success':True,'message':'run completed','input':payload,'output':results}
        
        
          

# Test block
if __name__ == '__main__':
    # Creating an instance
    
    pass

    
    
    
