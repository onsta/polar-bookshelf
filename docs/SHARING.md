# Overview

Sharing Design in Polar

# Datastructure

Update the DocMeta to include a new sharing section that's a sibling to DocInfo 
(DocSharing?)

```javascript

{
    /**
     * Stores the high level sharing permissions for the document including 
     * where we received and who has been given access.
     */
    sharing: {
        
        
        /**
         * Contains a list of users that are also sharing the same document that
         * we're collaborating with (all the peers in the group).
         */
        peers: [
            {
                source: {
                    id: 'firebase',
                    locale: 'us-central1',
                    owner: {
                        contact_id: '',
                    }
                },
                // the doc ID on this platform on what we have access to that is
                // shared with us.
                doc_id: '0x000'
            }            
        ]
                
    },
    permissions: {
        
        
    }
        
    
}
```

## doc_id

The `doc_id` is needed in the source so that we can use FileRef when the user
calls BackendFileRefs.toBackendFileRefs I can compute/add the required metadata
that needs to be attached to the FileRef to denote whether they are the owner or
not and who the owner is and how we build the URL properly.  

We then lookup the data on the backend permissions system so that we verify that
the user actually DOES have access to the file.

# Tables

## doc_permission

Contains the permissions set for the user for this document in their repo.

By default the document is private (no permissions).

### schema

|| id || The DocID of the document ||
|| uid || The users uid that owns the id (DocID) ||
|| fingerprint || The fingerprint of the document in the doc repo ||
|| recipients || An array of encoded recipients who have access to the document || 

## message

Stores a message for an 'inbox' that is displayed to a user. The messages are 
typed do we can have user to user messages but also features like a user added 
you as a contact or a user shared a document with you.

The user will have a popup in the top right with messages and they can either
accept or deny documents that were added and also 'open' them.

We use this for two main reasons:

- to notify you when someone has added you as a friend

- to notify you when you have a new document you can add to your repo

### schema

||type|| shared_doc | new_friend || The type of the message for the user||

### messages types

- shared_doc: a new document has been shared with you

#### shared_doc

## contact

A contact that you've interacted with in the past either as a friends or a handle. 

Used to keep track of everyone you've collaborated with so auto-complete can work.

### fields

|| id || A unique contact ID for this user and they are sharing some selected information about their profile ||
|| source || 'firebase-us-central1' || The source of this friend. Could be something outside of polar.
|| rel || ReadonlyArray<RelType> || The list or relationships for this contact.  
 
### type RelType = 'friend' | 'shared';

- friend: We've added this user as a friend

- shared: We've shared a document with this user.

# Issues

## When you share a document from someone can they later revoke their permissions to access the document?

Yes.  We should allow this though it's a rare use case.  We might also want to 
preserve the original user who shared it with us so that we can warn the user 
that they are about to block the original author.   

However, you're essentially  GIVING the document to someone thi sway.

## TODO

- Initially we have NO limits on who can be added.  We add everyone in the 
  chain this way people can discover one another indefinitely.  The one issue 
  here though is latency.  Users are going to pop in all at once.      

- email and using mandrill with mailchimp so that when someone is added they 
  get a transactional email from the user.

- TODO: need the structure for user pages so that users can link to their 
  timeline of documents, comments, and highlights.

    //
    // - We need 'anyone with the link can view' semantics which DOES require
    //   a token BUT we can make a special recipient of 'token' that has the
    //   token that you can use to view the document.

- TODO: should we have some sort of RBAC?

- TODO: I don't like how this is seemingly ad hoc and the schema for permissions 
  isn't defined very well.

# Regular Expressions

Regex works in Firebase but it's a bit weird.  The function is:

```javascript
return foo.matches(regex);
```

so 

```javascript
return "foo".matches("foo|bar");
```

will return true

This regex WILL work but I need to be VERY careful how I build this out.  The 
spaces between the groups needs to handled properly. 

Just accept:

- space, underscore, a-z, A-Z, 0-9, 

- make all records have space prefixes and suffixes.  For example keys of 
  'foo' and 'bar' would be encoded as:
  
  ' foo bar '
  
  'foo' -> ' foo '
  
- we will have to do string validation on the server side too... before we 
  accept the data.  This way we don't allow someone to create a group with a 
  space for example.  We can just use regex match on this space.   

# Solution to group membership problems:

We cna use hasAny method in list which will resolve this nicely as long as the
strings match up properly

https://firebase.google.com/docs/reference/rules/rules.List
https://firebase.google.com/docs/reference/rules/rules.Map


# Implementation Strategy

- the first big milestone I have to implement is changing the permissions with 
  one user and then fetching again with another user to make sure they can 
  access all the resources properly.

    https://firebase.google.com/docs/firestore/security/rules-conditions#access_other_documents


    The new rule should probably be

    - I don't need any sort of unusual access to this record.  Just fetch 
    by the available keys.
    
    
    resource.permissions.recipients[public]
    
    - FIXME how do I determine if the user is in a specific team... ?

    - maybe in the futrue I can use custom claims for this ... 
    
    - var/let/const cant' be used with functions... 
    
    
    https://firebase.google.com/docs/rules/rules-behavior
    
    "Some document access calls may be cached, and cached calls do not count towards the limits."
    
```
  allow read: if get(/databases/$(database)/documents/doc_permission/$(resource.data.id)).data.admin == true
  
  
```                

    TODO: 
        - how is teh doc_id preserved from the resource.data.id

    - I think we HAVE to have a doc_permission document becuase this needs to 
      apply to doc_info I think.. not just doc_meta.  It DOES NOT make a difference
      if we denormalize this.
      
      doc_meta
      doc_permission permission in the DocMeta (which is de-duplicated on the 
      root) and stored in DocHolder
      doc_sharing

    -       
      
      

- the current 'permissions' system of 'private' or 'public' with the DocMeta 
  won't really work with the new system so we have to upgrade the permissions 
  there to match this.  It was never deployed though so we're good.  I think we 
  just have to update the firebase permissions to match this system but I need
  to figure out how to write it and test it. 



1.  Write the data structure to firebase via test/command line so that we can verify that the data is written properly
2.  Write the hook on the backend to pass the request through with the proper lookup mechanism.
3.  Make sure the sharing data structure is serialize properly.  

